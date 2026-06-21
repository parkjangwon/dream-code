import { cwd as currentWorkingDirectory, stdout as output } from "node:process";

import { loadAgentDefinitions } from "./agent-definition-loader.js";
import { formatAgentRuns } from "./agent-run-format.js";
import { listActors } from "./actor-store.js";
import {
  agentLocations,
  customAgentTemplate,
  defaultAgentTemplates,
  writeAgentTemplate,
  type AgentDefinition,
  type AgentLocation,
  type AgentTemplate,
} from "./agent-library.js";
import { runAgentPrompt } from "./agent-runner.js";
import { ansi, paint } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { sendInboxMessage } from "./inbox-store.js";
import type { PickerOptions } from "./tui-picker.js";

export type AgentQuestioner = {
  readonly question: (prompt: string) => Promise<string>;
  readonly select?: (options: PickerOptions) => Promise<string | undefined>;
};

const agentTabs = {
  delegate: "delegate",
  running: "running",
  templates: "templates",
} as const;

const createAgentValue = "create-agent";

export async function showAgentsMenu(
  config: DreamConfig,
  configRoot: string,
  questioner: AgentQuestioner,
  cwd = currentWorkingDirectory(),
): Promise<void> {
  if (questioner.select === undefined) {
    output.write(await formatAgentsOverview(configRoot));
    return;
  }

  const tab = await questioner.select({
    title: "Agents",
    choices: [
      { value: agentTabs.delegate, label: "Delegate task", description: "Run one specialized subagent", keywords: ["delegate", "task", "agent"] },
      { value: agentTabs.running, label: "Running", description: "Show active subagents", keywords: ["running", "subagents"] },
      { value: agentTabs.templates, label: "Templates", description: "Create and manage reusable agents", keywords: ["templates", "library", "custom"] },
    ],
    initialValue: agentTabs.delegate,
  });

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

export async function formatAgentsOverview(configRoot: string): Promise<string> {
  return [
    `${paint("Agents", ansi.accent)}  ${paint("Delegate", ansi.dim)}  ${paint("Running", ansi.dim)}  ${paint("Templates", ansi.dim)}`,
    "",
    (await formatAgentRuns(configRoot)).trimEnd(),
    "",
    formatTemplateSummary().trimEnd(),
    "",
  ].join("\n");
}

async function delegateToAgent(
  config: DreamConfig,
  configRoot: string,
  questioner: AgentQuestioner,
  cwd: string,
): Promise<void> {
  const agents = await loadAgentDefinitions(configRoot, cwd);
  const selected = await questioner.select?.({
    title: "Delegate",
    choices: agentChoices(agents),
  });
  const agent = agents.find((candidate) => candidate.id === selected);
  if (agent === undefined) {
    return;
  }

  const task = (await questioner.question(`Task for ${agent.name}: `)).trim();
  if (task.length === 0) {
    output.write("agent delegation cancelled\n");
    return;
  }

  output.write(`${paint("Delegating", ansi.accent)} to ${paint(agent.name, ansi.bold)} ${paint(`(${agent.source})`, ansi.dim)}\n`);
  await runAgentPrompt({
    config,
    configRoot,
    prompt: task,
    agent,
    write: (chunk) => output.write(chunk),
  });
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
  const actors = (await listActors(configRoot)).filter((actor) => actor.status === "running" || actor.status === "queued" || actor.status === "idle");
  if (questioner.select === undefined || actors.length === 0) {
    output.write(await formatAgentRuns(configRoot));
    return;
  }
  const actorId = await questioner.select({
    title: "Running Agents",
    choices: actors.map((actor) => ({
      value: actor.id,
      label: actor.name,
      description: `${actor.status} · ${actor.task}`,
      keywords: [actor.id, actor.name, actor.task, actor.status],
    })),
  });
  const actor = actors.find((candidate) => candidate.id === actorId);
  if (actor === undefined) {
    output.write(await formatAgentRuns(configRoot));
    return;
  }
  const message = (await questioner.question(`Message to ${actor.name}: `)).trim();
  if (message.length === 0) {
    output.write("agent message cancelled\n");
    return;
  }
  await sendInboxMessage(configRoot, {
    receiverActorId: actor.id,
    senderActorId: "main",
    type: "user",
    content: message,
  });
  output.write(`${paint("queued inbox message:", ansi.green)} ${actor.name}\n`);
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

function agentChoices(agents: readonly AgentDefinition[]): PickerOptions["choices"] {
  return agents.map((agent) => ({
    value: agent.id,
    label: agent.name,
    description: `${agent.summary} · ${agent.source} · ${agent.model}`,
    keywords: [agent.id, agent.name, agent.summary, agent.source, agent.model, ...agent.tools],
  }));
}

function formatTemplateSummary(): string {
  const lines = [`${paint("Templates", ansi.accent)}`, "Create new agent", "", paint("Built-in templates:", ansi.dim)];
  for (const template of defaultAgentTemplates()) {
    lines.push(`  ${template.id} ${paint("·", ansi.dim)} ${paint(template.model, ansi.dim)} ${paint("·", ansi.dim)} ${template.summary}`);
  }
  return `${lines.join("\n")}\n`;
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
