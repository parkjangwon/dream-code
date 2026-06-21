import assert from "node:assert/strict";
import test from "node:test";

import type { AgentDefinition } from "../src/agent-library.js";
import { createSwarmSynthesisPrompt, type SwarmLane } from "../src/swarm-plan.js";

test("createSwarmSynthesisPrompt compacts oversized lane outputs before final merge", () => {
  const lane = swarmLane("lane-01", "Tech Lead");
  const prompt = createSwarmSynthesisPrompt("Audit everything", [
    {
      lane,
      output: `${"A".repeat(5000)}\nfinal finding`,
    },
  ]);

  assert.match(prompt, /Original goal: Audit everything/u);
  assert.match(prompt, /final finding/u);
  assert.match(prompt, /truncated/u);
  assert.ok(prompt.length < 5000);
});

function swarmLane(id: string, title: string): SwarmLane {
  return {
    id,
    title,
    agent: agent(id, title),
    prompt: "lane prompt",
  };
}

function agent(id: string, name: string): AgentDefinition {
  return {
    id,
    name,
    summary: "Inspect.",
    model: "inherit",
    tools: ["read"],
    prompt: `${name} prompt.`,
    source: "built-in",
  };
}
