import type { AgentDefinition } from "./agent-library.js";

export type SwarmLane = {
  readonly id: string;
  readonly title: string;
  readonly agent: AgentDefinition;
  readonly prompt: string;
};

export type SwarmPlan = {
  readonly goal: string;
  readonly lanes: readonly SwarmLane[];
  readonly maxConcurrency: number;
};

const preferredAgentOrder = [
  "tech-lead",
  "code-reviewer",
  "security-reviewer",
  "code-simplifier",
  "ux-reviewer",
] as const;

export function createSwarmPlan(
  goal: string,
  agents: readonly AgentDefinition[],
  maxAgents = 8,
): SwarmPlan {
  const selectedAgents = selectSwarmAgents(agents, maxAgents);
  return {
    goal,
    lanes: selectedAgents.map((agent, index) => ({
      id: `lane-${String(index + 1).padStart(2, "0")}-${agent.id}`,
      title: agent.name,
      agent,
      prompt: lanePrompt(goal, agent, index + 1),
    })),
    maxConcurrency: Math.max(1, selectedAgents.length),
  };
}

export function createSwarmSynthesisAgent(): AgentDefinition {
  return {
    id: "swarm-synthesizer",
    name: "Swarm Synthesizer",
    summary: "Merge parallel subagent outputs into one decisive answer.",
    model: "high",
    tools: ["read"],
    prompt: [
      "You merge Dream Code Agent Swarm outputs.",
      "Preserve concrete findings, remove duplicates, resolve conflicts, and return the shortest decisive next action list.",
    ].join(" "),
    source: "built-in",
  };
}

export function createSwarmSynthesisPrompt(
  goal: string,
  laneResults: readonly { readonly lane: SwarmLane; readonly output: string }[],
): string {
  return [
    "Merge these parallel Dream Code swarm results into one final answer.",
    `Original goal: ${goal}`,
    "",
    ...laneResults.map((result) => [
      `## ${result.lane.title}`,
      result.output.trim().length === 0 ? "(no output)" : result.output.trim(),
      "",
    ].join("\n")),
  ].join("\n");
}

function selectSwarmAgents(
  agents: readonly AgentDefinition[],
  maxAgents: number,
): readonly AgentDefinition[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const preferred = preferredAgentOrder
    .map((id) => byId.get(id))
    .filter(isAgentDefinition);
  const remaining = agents.filter((agent) => !preferred.some((selected) => selected.id === agent.id));
  return [...preferred, ...remaining].slice(0, Math.max(1, maxAgents));
}

function lanePrompt(goal: string, agent: AgentDefinition, laneNumber: number): string {
  return [
    `You are parallel swarm lane ${laneNumber}: ${agent.name}.`,
    "Work independently. Do not wait for other lanes. Spend tokens aggressively when it improves coverage.",
    `Original goal: ${goal}`,
    `Your lane mission: ${agent.summary}`,
    "Return a compact artifact with: Summary, Findings, Proposed actions, Risks.",
  ].join("\n");
}

function isAgentDefinition(value: AgentDefinition | undefined): value is AgentDefinition {
  return value !== undefined;
}
