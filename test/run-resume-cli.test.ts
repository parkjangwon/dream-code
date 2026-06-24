import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { startAgentRun } from "../src/agent-run-store.js";

const resumeSchema = z.object({
  title: z.literal("Dream Run Resume"),
  runId: z.string(),
  status: z.string(),
  prompt: z.string(),
  failureClass: z.string().optional(),
  changedFiles: z.array(z.string()),
  nextCommand: z.string(),
  replay: z.object({
    prompt: z.string(),
    recovery: z.string().optional(),
    nextAction: z.string().optional(),
  }),
});

test("dream runs resume latest --json emits a replayable resume package", async () => {
  const home = await mkdtemp(join(tmpdir(), "dream-run-resume-home-"));
  try {
    const run = await startAgentRun(home, {
      id: "run-resume-json",
      kind: "agent",
      agentId: "dream",
      agentName: "Dream",
      prompt: "ship production hardening",
    });
    run.tool("edit src/remote-auth.ts", {
      ok: false,
      changedPath: "src/remote-auth.ts",
      failureClass: "retryable",
      recovery: "Re-run after refreshing the generated route table.",
      nextAction: "Run npm run check after rebuilding.",
    });
    await run.finish("failed", { error: "Generated assets are stale." });

    const result = await runDream(["runs", "resume", "latest", "--json"], home);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const parsed = resumeSchema.parse(JSON.parse(result.stdout));
    assert.equal(parsed.runId, "run-resume-json");
    assert.equal(parsed.failureClass, "retryable");
    assert.deepEqual(parsed.changedFiles, ["src/remote-auth.ts"]);
    assert.match(parsed.nextCommand, /dream runs show run-resume-json --json/u);
    assert.equal(parsed.replay.nextAction, "Run npm run check after rebuilding.");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

function runDream(args: readonly string[], home: string): Promise<{ readonly stdout: string; readonly stderr: string; readonly code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["dist/src/cli.js", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, DREAM_CODE_HOME: home },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}
