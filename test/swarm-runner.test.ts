import assert from "node:assert/strict";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import type { AgentDefinition } from "../src/agent-library.js";
import { defaultConfig } from "../src/config.js";
import { renderSwarmMonitorSnapshot } from "../src/swarm-monitor-render.js";
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
    forceAgents: 3,
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

test("runAgentSwarmWithAgents renders live monitor progress", async () => {
  const chunks: string[] = [];

  await runAgentSwarmWithAgents({
    config: defaultConfig(),
    configRoot: "/tmp/dream",
    cwd: "/repo",
    goal: "Monitor the swarm",
    agents: [
      agent("tech-lead", "Tech Lead", "Plan."),
      agent("code-reviewer", "Code Reviewer", "Review."),
    ],
    forceAgents: 2,
    write: (chunk) => {
      chunks.push(chunk);
    },
    runAgent: async (input) => {
      if (input.kind === "lane") {
        input.report({ characters: 1536 });
        return `${input.agent.name} result`;
      }
      return "merged result";
    },
  });

  const output = stripAnsi(chunks.join(""));
  assert.match(output, /Dream Swarm/u);
  assert.match(output, /Swarm Monitor/u);
  assert.match(output, /RUNNING/u);
  assert.match(output, /DONE/u);
  assert.match(output, /1\.5k chars/u);
  assert.match(output, /merging parallel outputs/u);
  assert.match(output, /token mixing radar online/u);
  assert.match(output, /Swarm Synthesis/u);
});

test("runAgentSwarmWithAgents stops lanes and skips synthesis when aborted", async () => {
  const chunks: string[] = [];
  const laneStarted = deferred<void>();
  const abortController = new AbortController();
  const calls: string[] = [];
  const runPromise = runAgentSwarmWithAgents({
    config: defaultConfig(),
    configRoot: "/tmp/dream",
    cwd: "/repo",
    goal: "Stop the swarm",
    agents: [
      agent("tech-lead", "Tech Lead", "Plan."),
    ],
    forceAgents: 1,
    signal: abortController.signal,
    write: (chunk) => {
      chunks.push(chunk);
    },
    runAgent: async (input) => {
      calls.push(input.kind);
      if (input.kind === "lane") {
        laneStarted.resolve();
        return await new Promise<string>(() => undefined);
      }
      return "should not synthesize";
    },
  });

  await laneStarted.promise;
  abortController.abort();
  const summary = await runPromise;

  const output = stripAnsi(chunks.join(""));
  assert.equal(summary.synthesis, "Synthesis cancelled: swarm stopped by user.");
  assert.deepEqual(calls, ["lane"]);
  assert.match(output, /STOPPED/u);
  assert.match(output, /Swarm stopped/u);
});

test("renderSwarmMonitorSnapshot shows an armed escape stop hint", () => {
  const rendered = stripAnsi(renderSwarmMonitorSnapshot({
    goal: "Stop hint",
    startedAt: 1000,
    now: 1100,
    frame: 1,
    synthesisStatus: "waiting",
    selectedIndex: 1,
    view: "monitor",
    interactive: true,
    abortArmed: true,
    lanes: [
      {
        id: "lane-1",
        index: 1,
        title: "Tech Lead",
        status: "running",
        characters: 0,
        preview: "",
        startedAt: 1000,
        finishedAt: undefined,
      },
    ],
  }));

  assert.match(rendered, /esc again stop swarm/u);
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
