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
