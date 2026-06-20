import { cwd as currentWorkingDirectory, stdout as output } from "node:process";

import {
  agentLocations,
  customAgentTemplate,
  defaultAgentTemplates,
  writeAgentTemplate,
  type AgentLocation,
  type AgentTemplate,
} from "./agent-library.js";
import { ansi, paint } from "./ansi.js";
import type { PickerOptions } from "./tui-picker.js";

export type AgentQuestioner = {
  readonly question: (prompt: string) => Promise<string>;
  readonly select?: (options: PickerOptions) => Promise<string | undefined>;
};

const agentTabs = {
  running: "running",
  crew: "crew",
} as const;

const createAgentValue = "create-agent";

export async function showAgentsMenu(
  configRoot: string,
  questioner: AgentQuestioner,
  cwd = currentWorkingDirectory(),
): Promise<void> {
  if (questioner.select === undefined) {
    output.write(formatAgentsOverview());
    return;
  }

  const tab = await questioner.select({
    title: "Agents",
    choices: [
      { value: agentTabs.running, label: "Running", description: "Show active subagents", keywords: ["running", "subagents"] },
      { value: agentTabs.crew, label: "Crew", description: "Create and manage reusable agents", keywords: ["crew", "team", "library", "templates"] },
    ],
    initialValue: agentTabs.crew,
  });

  if (tab === agentTabs.crew) {
    await showCrewMenu(configRoot, questioner, cwd);
    return;
  }
  if (tab === agentTabs.running) {
    output.write(formatRunningAgents());
  }
}

export function formatAgentsOverview(): string {
  return [
    `${paint("Agents", ansi.accent)}  ${paint("Running", ansi.dim)}  ${paint("Crew", ansi.dim)}`,
    "",
    formatRunningAgents().trimEnd(),
    "",
    formatCrewSummary().trimEnd(),
    "",
  ].join("\n");
}

async function showCrewMenu(
  configRoot: string,
  questioner: AgentQuestioner,
  cwd: string,
): Promise<void> {
  const selected = await questioner.select?.({
    title: "Crew",
    choices: crewChoices(),
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
  const prompt = (await questioner.question("System prompt: ")).trim() || `You are ${name}, a Dream Code crew agent.`;
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

function crewChoices(): PickerOptions["choices"] {
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

function formatRunningAgents(): string {
  return [
    `${paint("Running", ansi.accent)}`,
    paint("No subagents are currently running.", ansi.dim),
    "",
  ].join("\n");
}

function formatCrewSummary(): string {
  const lines = [`${paint("Crew", ansi.accent)}`, "Create new agent", "", paint("Built-in templates:", ansi.dim)];
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
