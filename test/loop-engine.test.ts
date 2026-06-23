import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseLoopSpec } from "../src/loop-spec.js";
import { runLoopSpec } from "../src/loop-engine.js";

test("loop engine repeats agent work until a command evaluator passes", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "dream-loop-engine-"));
  try {
    await writeFile(join(workspace, "check.mjs"), `
      import { existsSync } from "node:fs";
      process.exit(existsSync("pass.txt") ? 0 : 1);
    `, "utf8");
    const spec = parseLoopSpec(JSON.stringify({
      version: 1,
      name: "test-loop",
      goal: "Create the pass marker",
      prompt: "Make the evaluator pass",
      maxTurns: 2,
      evaluator: {
        type: "command",
        command: process.execPath,
        args: ["check.mjs"],
      },
    }));

    const result = await runLoopSpec({
      workspace,
      spec,
      runAgent: async ({ turn }) => {
        if (turn === 2) {
          await writeFile(join(workspace, "pass.txt"), "ok", "utf8");
        }
        return `turn ${turn}`;
      },
    });

    assert.equal(result.status, "passed");
    assert.equal(result.turns, 2);
    assert.equal(result.evaluations.length, 2);
    assert.equal(result.evaluations.at(-1)?.passed, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("loop engine reports exhausted when the evaluator never passes", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "dream-loop-exhausted-"));
  try {
    const spec = parseLoopSpec(JSON.stringify({
      version: 1,
      name: "stubborn-loop",
      goal: "Pass an impossible check",
      maxTurns: 1,
      evaluator: {
        type: "command",
        command: process.execPath,
        args: ["-e", "process.exit(2)"],
        passExitCodes: [0],
      },
    }));

    const result = await runLoopSpec({
      workspace,
      spec,
      runAgent: async () => "attempted",
    });

    assert.equal(result.status, "exhausted");
    assert.equal(result.turns, 1);
    assert.equal(result.evaluations[0]?.exitCode, 2);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("loop spec rejects unsupported schema versions", () => {
  assert.throws(
    () => parseLoopSpec(JSON.stringify({
      version: 2,
      name: "future-loop",
      goal: "Use a newer contract",
      evaluator: {
        type: "command",
        command: process.execPath,
      },
    })),
    /Could not parse loop spec/u,
  );
});

test("loop engine summarizes evaluator output before the next agent turn", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "dream-loop-summary-"));
  try {
    const prompts: string[] = [];
    const spec = parseLoopSpec(JSON.stringify({
      version: 1,
      name: "summary-loop",
      goal: "Keep retry context compact",
      maxTurns: 2,
      evaluator: {
        type: "command",
        command: process.execPath,
        args: ["-e", "console.error('x'.repeat(9000)); process.exit(1)"],
      },
    }));

    await runLoopSpec({
      workspace,
      spec,
      runAgent: async ({ prompt }) => {
        prompts.push(prompt);
        return "attempted";
      },
    });

    assert.equal(prompts.length, 2);
    assert.equal((prompts[1] ?? "").length < 2_500, true);
    assert.match(prompts[1] ?? "", /stderr:/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("loop engine records failed events when an agent turn throws", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "dream-loop-agent-fail-"));
  try {
    const spec = parseLoopSpec(JSON.stringify({
      version: 1,
      name: "agent-fail",
      goal: "Show failed trace",
      evaluator: {
        type: "command",
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
      },
    }));

    const result = await runLoopSpec({
      workspace,
      spec,
      runAgent: async () => {
        throw new Error("agent broke");
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.events.some((event) => event.type === "agent" && event.status === "failed"), true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("loop engine cancels evaluator commands through AbortSignal", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "dream-loop-cancel-"));
  try {
    const controller = new AbortController();
    const spec = parseLoopSpec(JSON.stringify({
      version: 1,
      name: "cancel-loop",
      goal: "Stop promptly",
      evaluator: {
        type: "command",
        command: process.execPath,
        args: ["-e", "setInterval(() => {}, 1000)"],
        timeoutMs: 5_000,
      },
    }));
    setTimeout(() => controller.abort(), 30);

    const result = await runLoopSpec({
      workspace,
      spec,
      signal: controller.signal,
      killGraceMs: 20,
      runAgent: async () => "waiting",
    });

    assert.equal(result.status, "cancelled");
    assert.equal(result.evaluations[0]?.timedOut, false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("loop engine escalates timed-out commands that ignore SIGTERM", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "dream-loop-timeout-"));
  try {
    const spec = parseLoopSpec(JSON.stringify({
      version: 1,
      name: "timeout-loop",
      goal: "Kill stubborn evaluators",
      maxTurns: 1,
      evaluator: {
        type: "command",
        command: process.execPath,
        args: ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
        timeoutMs: 20,
      },
    }));

    const result = await runLoopSpec({
      workspace,
      spec,
      killGraceMs: 20,
      runAgent: async () => "waiting",
    });

    assert.equal(result.status, "exhausted");
    assert.equal(result.evaluations[0]?.timedOut, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
