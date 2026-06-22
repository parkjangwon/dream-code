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
  const plan = createSwarmPlan("Improve mobile TUI release flow", agents, { intensity: "standard" });

  assert.equal(plan.goal, "Improve mobile TUI release flow");
  assert.equal(plan.lanes.length, 5);
  assert.deepEqual(plan.lanes.map((lane) => lane.title), [
    "UX Flow Reviewer",
    "Verification Strategist",
    "Mobile Terminal Reviewer",
    "Release Artifact Verifier",
    "Docs Guidance Reviewer",
  ]);
  assert.match(plan.lanes[0]?.prompt ?? "", /parallel swarm lane/u);
  assert.match(plan.lanes[0]?.prompt ?? "", /Your lane mission/u);
});

test("createSwarmPlan can force an exact lane count without cloning titles", () => {
  const plan = createSwarmPlan("Ship faster", agents, { forceLanes: 5 });

  assert.equal(plan.forced, true);
  assert.equal(plan.lanes.length, 5);
  assert.equal(new Set(plan.lanes.map((lane) => lane.title)).size, 5);
  assert.match(plan.lanes[4]?.prompt ?? "", /Base agent profile/u);
});

test("createSwarmPlan separates forced lane count from safe runtime concurrency", () => {
  const plan = createSwarmPlan("Push the swarm", agents, { forceLanes: 30 });

  assert.equal(plan.lanes.length, 30);
  assert.equal(plan.maxConcurrency, 16);
});

test("createSwarmPlan supports intensity presets", () => {
  assert.equal(createSwarmPlan("Audit", agents, { intensity: "light" }).lanes.length, 3);
  assert.equal(createSwarmPlan("Audit", agents, { intensity: "deep" }).lanes.length, 8);
  assert.equal(createSwarmPlan("Audit", agents, { intensity: "max" }).lanes.length, 12);
  assert.equal(createSwarmPlan("Audit", agents, { intensity: "overdrive" }).lanes.length, 10);
});

test("createSwarmPlan uses adversarial overdrive lanes", () => {
  const plan = createSwarmPlan("Analyze project risks", agents, { intensity: "overdrive" });

  assert.equal(plan.intensity, "overdrive");
  assert.deepEqual(plan.lanes.slice(0, 8).map((lane) => lane.title), [
    "Failure Mode Hunter",
    "Security Boundary Auditor",
    "Contrarian Reviewer",
    "Regression Sniper",
    "Verification Strategist",
    "Implementation Reviewer",
    "Performance Skeptic",
    "Integration Breaker",
  ]);
});

test("createSwarmPlan keeps exact-lane overdrive as the hidden high-lane path", () => {
  const plan = createSwarmPlan("Audit hard", agents, { forceLanes: 25, intensity: "overdrive" });

  assert.equal(plan.forced, true);
  assert.equal(plan.intensity, "overdrive");
  assert.equal(plan.lanes.length, 25);
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
