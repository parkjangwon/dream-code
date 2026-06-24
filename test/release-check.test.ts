import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

type CliResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
};

const releaseCheckSchema = z.object({
  title: z.literal("Dream Release Check"),
  ok: z.boolean(),
  checks: z.array(z.object({
    id: z.string(),
    status: z.enum(["pass", "warn", "fail"]),
    detail: z.string(),
    command: z.string(),
    repair: z.string(),
  })),
});

test("runReleaseCheck reports smoke and package readiness", async () => {
  const home = await mkdtemp(join(tmpdir(), "dream-release-home-"));
  try {
    const result = await runDream(["release-check", "--json"], home);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const parsed = releaseCheckSchema.parse(JSON.parse(result.stdout));
    assert.equal(parsed.title, "Dream Release Check");
    assert.equal(parsed.checks.some((check) => check.id === "smoke" && check.status === "pass"), true);
    assert.equal(parsed.checks.some((check) => check.id === "pack" && check.status === "pass"), true);
    assert.equal(parsed.checks.every((check) => check.repair.length > 0), true);
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
