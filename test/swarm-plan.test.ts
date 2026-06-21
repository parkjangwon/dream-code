import assert from "node:assert/strict";
import test from "node:test";

import type { AgentDefinition } from "../src/agent-library.js";
import { createSwarmPlan } from "../src/swarm-plan.js";

const agents: readonly AgentDefinition[] = [
  agent("tech-lead", "Tech Lead", "Plan the work.", "high"),
  agent("code-reviewer", "Code Reviewer", "Review changes.", "inherit"),
  agent("security-reviewer", "Security Reviewer", "Find risks.", "high"),
  agent("ux-reviewer", "UX Reviewer", "Polish UX.", "inherit"),
  agent("code-simplifier", "Code Simplifier", "Reduce complexity.", "inherit"),
];

test("createSwarmPlan fans a goal out to specialized parallel lanes", () => {
  const plan = createSwarmPlan("Build agent swarm", agents, 4);

  assert.equal(plan.goal, "Build agent swarm");
  assert.equal(plan.lanes.length, 4);
  assert.deepEqual(plan.lanes.map((lane) => lane.agent.id), [
    "tech-lead",
    "code-reviewer",
    "security-reviewer",
    "code-simplifier",
  ]);
  assert.match(plan.lanes[0]?.prompt ?? "", /parallel swarm lane/u);
  assert.match(plan.lanes[0]?.prompt ?? "", /Build agent swarm/u);
});

test("createSwarmPlan can force more lanes than unique agents", () => {
  const plan = createSwarmPlan("Ship faster", agents.slice(0, 2), { forceAgents: 5 });

  assert.equal(plan.forced, true);
  assert.equal(plan.lanes.length, 5);
  assert.deepEqual(plan.lanes.map((lane) => lane.agent.id), [
    "tech-lead",
    "code-reviewer",
    "tech-lead",
    "code-reviewer",
    "tech-lead",
  ]);
  assert.match(plan.lanes[4]?.prompt ?? "", /UX, developer ergonomics, and polish/u);
});

test("createSwarmPlan separates forced lane count from safe runtime concurrency", () => {
  const plan = createSwarmPlan("Push the swarm", agents, { forceAgents: 30 });

  assert.equal(plan.lanes.length, 30);
  assert.equal(plan.maxConcurrency, 16);
});

function agent(id: string, name: string, summary: string, model: string): AgentDefinition {
  return {
    id,
    name,
    summary,
    model,
    tools: ["read"],
    prompt: `${name} instructions.`,
    source: "built-in",
  };
}
