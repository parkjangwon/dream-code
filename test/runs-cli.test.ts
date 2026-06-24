import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { startAgentRun } from "../src/agent-run-store.js";

type CliResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
};

const runAuditSchema = z.object({
  id: z.string(),
  status: z.string(),
  telemetry: z.object({
    failedTools: z.number(),
    totalDurationMs: z.number(),
    tools: z.array(z.object({
      label: z.string(),
      durationMs: z.number().optional(),
      batchId: z.string().optional(),
      sequence: z.number().optional(),
      risk: z.string().optional(),
      recovery: z.string().optional(),
    })),
  }),
});

test("dream runs show latest --json prints auditable telemetry", async () => {
  const home = await mkdtemp(join(tmpdir(), "dream-runs-cli-home-"));
  try {
    await mkdir(join(home, "agents", "runs"), { recursive: true });
    const run = await startAgentRun(home, {
      id: "run-cli-audit",
      kind: "agent",
      agentId: "dream",
      agentName: "Dream",
      prompt: "audit this run",
    });
    run.tool("read README.md", {
      ok: true,
      durationMs: 9,
      batchId: "batch-1",
      sequence: 1,
      risk: "read-only",
    });
    await run.finish("done");

    const result = await runDream(["runs", "show", "latest", "--json"], home);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const parsed = runAuditSchema.parse(JSON.parse(result.stdout));
    assert.equal(parsed.id, "run-cli-audit");
    assert.equal(parsed.telemetry.tools[0]?.batchId, "batch-1");
    assert.equal(parsed.telemetry.tools[0]?.risk, "read-only");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

function runDream(args: readonly string[], home: string): Promise<CliResult> {
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
