import assert from "node:assert/strict";
import test from "node:test";

import type { AgentDefinition } from "../src/agent-library.js";
import { defaultConfig } from "../src/config.js";
import { runAgentSwarmWithAgents } from "../src/swarm-runner.js";

test("runAgentSwarmWithAgents starts fan-out lanes in parallel before synthesis", async () => {
  const release = deferred<void>();
  const allStarted = deferred<void>();
  const calls: string[] = [];
  let started = 0;

  const runPromise = runAgentSwarmWithAgents({
    config: defaultConfig(),
    configRoot: "/tmp/dream",
    cwd: "/repo",
    goal: "Audit the project",
    agents: [
      agent("tech-lead", "Tech Lead", "Plan."),
      agent("code-reviewer", "Code Reviewer", "Review."),
      agent("security-reviewer", "Security Reviewer", "Audit."),
    ],
    maxAgents: 3,
    write: () => undefined,
    runAgent: async (input) => {
      calls.push(`${input.kind}:${input.agent.id}`);
      if (input.kind === "lane") {
        started += 1;
        if (started === 3) {
          allStarted.resolve();
        }
        await release.promise;
        return `${input.agent.name} result`;
      }
      return "merged result";
    },
  });

  await allStarted.promise;
  assert.equal(started, 3);
  release.resolve();

  const summary = await runPromise;
  assert.equal(summary.laneResults.length, 3);
  assert.equal(summary.synthesis, "merged result");
  assert.deepEqual(calls.slice(0, 3), [
    "lane:tech-lead",
    "lane:code-reviewer",
    "lane:security-reviewer",
  ]);
  assert.equal(calls[3], "synthesis:swarm-synthesizer");
});

function agent(id: string, name: string, summary: string): AgentDefinition {
  return {
    id,
    name,
    summary,
    model: "inherit",
    tools: ["read"],
    prompt: `${name} instructions.`,
    source: "built-in",
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolveValue: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });
  return { promise, resolve: resolveValue };
}
