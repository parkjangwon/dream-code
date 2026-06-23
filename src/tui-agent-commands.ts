import { cwd as currentWorkingDirectory, stdout as output } from "node:process";

import { listAgentBoardRows } from "./agent-board.js";
import {
  agentLocations,
  customAgentTemplate,
  defaultAgentTemplates,
  writeAgentTemplate,
  type AgentLocation,
  type AgentTemplate,
} from "./agent-library.js";
import { loadAgentDefinitions } from "./agent-definition-loader.js";
import { ansi, paint } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { peekAgentRun, replyToAgent, runAgentRowAction, stopAgentRun } from "./tui-agent-board-actions.js";
import { delegateFromArgs, delegateToAgent } from "./tui-agent-dispatch.js";
import { agentViewLines, type AgentViewOptions, type AgentViewResult } from "./tui-agent-view.js";
import type { PickerOptions } from "./tui-picker.js";

export type AgentQuestioner = {
  readonly question: (prompt: string) => Promise<string>;
  readonly select?: (options: PickerOptions) => Promise<string | undefined>;
  readonly manageAgents?: (options: AgentViewOptions) => Promise<AgentViewResult>;
};

const agentTabs = {
  board: "board",
  delegate: "delegate",
  running: "running",
  templates: "templates",
} as const;

const createAgentValue = "create-agent";
const runningActionPrefix = "running:";

export async function showAgentsMenu(
  config: DreamConfig,
  configRoot: string,
  questioner: AgentQuestioner,
  cwd = currentWorkingDirectory(),
  args = "",
): Promise<void> {
  if (args.trim().length > 0) {
    await delegateFromArgs(config, configRoot, cwd, args);
    return;
  }

  if (questioner.manageAgents !== undefined) {
    await handleAgentViewResult(await questioner.manageAgents({
      agents: await loadAgentDefinitions(configRoot, cwd),
      rows: await listAgentBoardRows(configRoot),
    }), configRoot, questioner, cwd);
    return;
  }

  if (questioner.select === undefined) {
    output.write(await formatAgentsOverview(configRoot));
    return;
  }

  const tab = await questioner.select({
    title: "Agent Board",
    choices: [
      { value: agentTabs.board, label: "Refresh board", description: "Show the latest agent state", keywords: ["board", "refresh", "status"] },
      { value: agentTabs.delegate, label: "Dispatch agent", description: "Run one specialized subagent", keywords: ["delegate", "dispatch", "task", "agent"] },
      { value: agentTabs.running, label: "Open session", description: "Peek, reply, or stop an active agent", keywords: ["running", "subagents", "reply", "stop"] },
      { value: agentTabs.templates, label: "Templates", description: "Create and manage reusable agents", keywords: ["templates", "library", "custom"] },
    ],
    initialValue: agentTabs.board,
  });

  if (tab === agentTabs.board) {
    output.write(await formatAgentsOverview(configRoot));
    return;
  }
  if (tab === agentTabs.delegate) {
    await delegateToAgent(config, configRoot, questioner, cwd);
    return;
  }
  if (tab === agentTabs.templates) {
    await showTemplatesMenu(configRoot, questioner, cwd);
    return;
  }
  if (tab === agentTabs.running) {
    await showRunningAgentsMenu(configRoot, questioner);
  }
}

export async function formatAgentsOverview(configRoot: string, cwd = currentWorkingDirectory()): Promise<string> {
  return `${agentViewLines({
    agents: await loadAgentDefinitions(configRoot, cwd),
    rows: await listAgentBoardRows(configRoot),
    selectedIndex: 0,
    tab: "running",
  }).join("\n")}\n`;
}

async function handleAgentViewResult(
  result: AgentViewResult,
  configRoot: string,
  questioner: AgentQuestioner,
  cwd: string,
): Promise<void> {
  switch (result.kind) {
    case "open":
      await runAgentRowAction(configRoot, questioner, result.row);
      return;
    case "peek":
      await peekAgentRun(configRoot, result.row);
      return;
    case "reply":
      await replyToAgent(configRoot, questioner, result.row);
      return;
    case "stop":
      stopAgentRun(result.row);
      return;
    case "templates":
      await showTemplatesMenu(configRoot, questioner, cwd);
      return;
    case "close":
      return;
    default:
      return assertNever(result);
  }
}

async function showTemplatesMenu(
  configRoot: string,
  questioner: AgentQuestioner,
  cwd: string,
): Promise<void> {
  const selected = await questioner.select?.({
    title: "Templates",
    choices: templateChoices(),
  });
  if (selected === undefined) {
    return;
  }
  if (selected === createAgentValue) {
    await createManualAgent(configRoot, questioner, cwd);
    return;
  }
  const template = defaultAgentTemplates().find((candidate) => candidate.id === selected);
  if (template !== undefined) {
    await createTemplateAgent(configRoot, questioner, cwd, template);
  }
}

async function showRunningAgentsMenu(configRoot: string, questioner: AgentQuestioner): Promise<void> {
  const rows = (await listAgentBoardRows(configRoot)).filter((row) => row.group !== "completed");
  if (questioner.select === undefined || rows.length === 0) {
    output.write(await formatAgentsOverview(configRoot));
    return;
  }
  const selected = await questioner.select({
    title: "Open Agent",
    choices: rows.map((row) => ({
      value: `${runningActionPrefix}${row.id}`,
      label: row.name,
      description: `${row.status.toLowerCase()} · ${row.summary}`,
      keywords: [row.id, row.name, row.prompt, row.status],
    })),
  });
  const row = rows.find((candidate) => `${runningActionPrefix}${candidate.id}` === selected);
  if (row === undefined) {
    output.write(await formatAgentsOverview(configRoot));
    return;
  }
  await runAgentRowAction(configRoot, questioner, row);
}

async function createTemplateAgent(
  configRoot: string,
  questioner: AgentQuestioner,
  cwd: string,
  template: AgentTemplate,
): Promise<void> {
  const location = await promptAgentLocation(questioner);
  if (location === undefined) {
    output.write("agent creation cancelled\n");
    return;
  }
  const filePath = await writeAgentTemplate(configRoot, cwd, location, template);
  output.write(`created agent: ${filePath}\n`);
}

async function createManualAgent(
  configRoot: string,
  questioner: AgentQuestioner,
  cwd: string,
): Promise<void> {
  const location = await promptAgentLocation(questioner);
  if (location === undefined) {
    output.write("agent creation cancelled\n");
    return;
  }
  const name = (await questioner.question("Agent name: ")).trim();
  if (name.length === 0) {
    output.write("agent creation cancelled\n");
    return;
  }
  const summary = (await questioner.question("Description: ")).trim() || "Dream Code custom agent.";
  const prompt = (await questioner.question("System prompt: ")).trim() || `You are ${name}, a Dream Code subagent.`;
  const filePath = await writeAgentTemplate(configRoot, cwd, location, customAgentTemplate(name, summary, prompt));
  output.write(`created agent: ${filePath}\n`);
}

async function promptAgentLocation(questioner: AgentQuestioner): Promise<AgentLocation | undefined> {
  if (questioner.select !== undefined) {
    const selected = await questioner.select({
      title: "Create new agent",
      choices: [
        { value: agentLocations.project, label: "Project (.dream/agents/)", description: "Share with this repository", keywords: ["project"] },
        { value: agentLocations.personal, label: "Personal (~/.dream/agents/)", description: "Use across projects", keywords: ["personal"] },
      ],
      initialValue: agentLocations.project,
    });
    return parseAgentLocation(selected);
  }

  return parseAgentLocation(await questioner.question("Location [project/personal]: "));
}

function templateChoices(): PickerOptions["choices"] {
  return [
    { value: createAgentValue, label: "Create new agent", description: "Manual configuration", keywords: ["create", "new", "custom"] },
    ...defaultAgentTemplates().map((template) => ({
      value: template.id,
      label: template.name,
      description: `${template.summary} · ${template.model}`,
      keywords: [template.id, template.name, template.summary, ...template.tools],
    })),
  ];
}

function parseAgentLocation(value: string | undefined): AgentLocation | undefined {
  switch (value?.trim()) {
    case agentLocations.personal:
      return agentLocations.personal;
    case agentLocations.project:
    case "":
      return agentLocations.project;
    default:
      return undefined;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected agent view result: ${String(value)}`);
}
