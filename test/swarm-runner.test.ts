import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import type { AgentDefinition } from "../src/agent-library.js";
import { defaultConfig } from "../src/config.js";
import { checkpointPath, taskProgressPath } from "../src/memory-store.js";
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
  assert.match(chunks.join(""), /\u001B\[38;5;240m✓ Swarm complete/u);
});

test("runAgentSwarmWithAgents rewrites synthesis done time to total swarm time", async () => {
  const chunks: string[] = [];
  let clock = 1_000;
  await runAgentSwarmWithAgents({
    config: defaultConfig(),
    configRoot: "/tmp/dream",
    cwd: "/repo",
    goal: "Format total elapsed",
    agents: [
      agent("tech-lead", "Tech Lead", "Plan."),
    ],
    forceAgents: 1,
    now: () => clock,
    write: (chunk) => {
      chunks.push(chunk);
    },
    runAgent: async (input) => {
      if (input.kind === "lane") {
        clock = 31_000;
        return "lane result";
      }
      clock = 57_000;
      return "summary\n✓ Done 26.0s · ~1000 tokens";
    },
  });

  const output = stripAnsi(chunks.join(""));
  assert.match(output, /✓ Done 56\.0s · ~1000 tokens/u);
  assert.doesNotMatch(output, /✓ Done 26\.0s/u);
  assert.match(chunks.join(""), /\u001B\[38;5;141m\u001B\[1m✓ Done 56\.0s/u);
});

test("runAgentSwarmWithAgents synthesizes large swarms by default", async () => {
  const chunks: string[] = [];
  const calls: string[] = [];
  const summary = await runAgentSwarmWithAgents({
    config: defaultConfig(),
    configRoot: "/tmp/dream",
    cwd: "/repo",
    goal: "Compress the merge",
    agents: [
      agent("tech-lead", "Tech Lead", "Plan."),
      agent("code-reviewer", "Code Reviewer", "Review."),
      agent("security-reviewer", "Security Reviewer", "Audit."),
      agent("code-simplifier", "Code Simplifier", "Simplify."),
      agent("ux-reviewer", "UX Reviewer", "Polish."),
    ],
    forceAgents: 8,
    write: (chunk) => {
      chunks.push(chunk);
    },
    runAgent: async (input) => {
      calls.push(input.kind);
      if (input.kind === "synthesis") {
        return "Final merged answer from all swarm lanes.";
      }
      return [
        `Summary from ${input.agent.name}`,
        "Findings: useful signal.",
        "Proposed actions: move quickly.",
      ].join("\n");
    },
  });

  assert.equal(summary.laneResults.length, 8);
  assert.equal(calls.filter((kind) => kind === "lane").length, 8);
  assert.equal(calls.at(-1), "synthesis");
  assert.match(summary.synthesis, /Final merged answer/u);
  assert.doesNotMatch(stripAnsi(chunks.join("")), /Lane Signals/u);
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

test("runAgentSwarmWithAgents absorbs completed swarms into memory layers", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-swarm-memory-"));
  try {
    await runAgentSwarmWithAgents({
      config: defaultConfig(),
      configRoot: root,
      cwd: "/repo",
      goal: "Remember the swarm",
      sessionId: "session-a",
      agents: [
        agent("tech-lead", "Tech Lead", "Plan."),
      ],
      forceAgents: 1,
      write: () => undefined,
      runAgent: async (input) => input.kind === "lane" ? "lane finding" : "merged memory",
    });

    assert.match(await readFile(checkpointPath(root, "/repo", "session-a"), "utf8"), /merged memory/u);
    assert.match(await readFile(taskProgressPath(root, "/repo", "swarm-remember-the-swarm"), "utf8"), /lane finding/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
