import { stdout as output } from "node:process";

import { loadAgentDefinitions } from "./agent-definition-loader.js";
import { runAgentPrompt } from "./agent-runner.js";
import type { AgentDefinition } from "./agent-library.js";
import { ansi, paint } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import type { PickerOptions } from "./tui-picker.js";

export type AgentDispatchQuestioner = {
  readonly question: (prompt: string) => Promise<string>;
  readonly select?: (options: PickerOptions) => Promise<string | undefined>;
};

export async function delegateToAgent(
  config: DreamConfig,
  configRoot: string,
  questioner: AgentDispatchQuestioner,
  cwd: string,
): Promise<void> {
  const agents = await loadAgentDefinitions(configRoot, cwd);
  const selected = await questioner.select?.({
    title: "Dispatch Agent",
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

  await runDelegatedAgent(config, configRoot, agent, task);
}

export async function delegateFromArgs(
  config: DreamConfig,
  configRoot: string,
  cwd: string,
  args: string,
): Promise<void> {
  const request = parseAgentMention(args);
  if (request === undefined) {
    output.write("usage: /agents @agent-name task\n");
    return;
  }
  const agents = await loadAgentDefinitions(configRoot, cwd);
  const agent = agents.find((candidate) => candidate.id === request.agentId || candidate.name.toLowerCase() === request.agentId);
  if (agent === undefined) {
    output.write(`unknown agent: ${request.agentId}\n`);
    return;
  }
  await runDelegatedAgent(config, configRoot, agent, request.task);
}

export async function dispatchAgentViewPrompt(
  config: DreamConfig,
  configRoot: string,
  cwd: string,
  prompt: string,
): Promise<void> {
  if (prompt.trim().startsWith("@")) {
    await delegateFromArgs(config, configRoot, cwd, prompt);
    return;
  }
  output.write(`${paint("Dispatching", ansi.accent)} ${paint("Dream Agent", ansi.bold)}\n`);
  output.write(`${paint("Task", ansi.dim)} ${prompt.trim()}\n`);
  await runAgentPrompt({
    config,
    configRoot,
    prompt: prompt.trim(),
    write: (chunk) => output.write(chunk),
  });
}

function agentChoices(agents: readonly AgentDefinition[]): PickerOptions["choices"] {
  return agents.map((agent) => ({
    value: agent.id,
    label: agent.name,
    description: `${agent.summary} · ${agent.source} · ${agent.model}`,
    keywords: [agent.id, agent.name, agent.summary, agent.source, agent.model, ...agent.tools],
  }));
}

async function runDelegatedAgent(
  config: DreamConfig,
  configRoot: string,
  agent: AgentDefinition,
  task: string,
): Promise<void> {
  output.write(`${paint("Delegating", ansi.accent)} to ${paint(agent.name, ansi.bold)} ${paint(`(${agent.source})`, ansi.dim)}\n`);
  output.write(`${paint("Task", ansi.dim)} ${task}\n`);
  await runAgentPrompt({
    config,
    configRoot,
    prompt: task,
    agent,
    write: (chunk) => output.write(chunk),
  });
}

function parseAgentMention(args: string): { readonly agentId: string; readonly task: string } | undefined {
  const trimmed = args.trim();
  if (!trimmed.startsWith("@")) {
    return undefined;
  }
  const firstSpace = trimmed.search(/\s/u);
  if (firstSpace === -1) {
    return undefined;
  }
  const agentId = trimmed.slice(1, firstSpace).trim().toLowerCase();
  const task = trimmed.slice(firstSpace).trim();
  return agentId.length === 0 || task.length === 0 ? undefined : { agentId, task };
}
