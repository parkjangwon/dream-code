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

const smokeJsonSchema = z.object({
  title: z.literal("Dream Smoke"),
  ok: z.boolean(),
  checks: z.array(z.object({
    id: z.string(),
    status: z.enum(["pass", "warn", "fail"]),
    detail: z.string(),
    repair: z.string(),
  })),
});

test("dream smoke prints a production readiness summary", async () => {
  const home = await mkdtemp(join(tmpdir(), "dream-smoke-home-"));
  try {
    const result = await runDream(["smoke"], home);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /Dream Smoke/u);
    assert.match(result.stdout, /doctor/u);
    assert.match(result.stdout, /workday/u);
    assert.match(result.stdout, /tool guard/u);
    assert.match(result.stdout, /smoke gate/u);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("dream smoke --json emits parseable readiness evidence", async () => {
  const home = await mkdtemp(join(tmpdir(), "dream-smoke-json-home-"));
  try {
    const result = await runDream(["smoke", "--json"], home);

    assert.equal(result.code, 0);
    const parsed = smokeJsonSchema.parse(JSON.parse(result.stdout));

    assert.equal(parsed.title, "Dream Smoke");
    assert.equal(parsed.checks.some((check) => check.id === "tool-guard" && check.status === "pass"), true);
    assert.equal(parsed.checks.some((check) => check.id === "smoke-gate"), true);
    assert.equal(parsed.checks.some((check) => check.id === "session-store" && check.status === "pass"), true);
    assert.equal(parsed.checks.some((check) => check.id === "checkpoint-store" && check.status === "pass"), true);
    assert.equal(parsed.checks.some((check) => check.id === "model-route" && check.status !== "fail"), true);
    assert.equal(parsed.checks.some((check) => check.id === "remote-security" && check.status === "pass"), true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("dream smoke includes repair guidance in JSON and text output", async () => {
  const home = await mkdtemp(join(tmpdir(), "dream-smoke-repair-home-"));
  try {
    const jsonResult = await runDream(["smoke", "--json"], home);
    const textResult = await runDream(["smoke"], home);

    assert.equal(jsonResult.code, 0);
    assert.equal(textResult.code, 0);
    const parsed = smokeJsonSchema.parse(JSON.parse(jsonResult.stdout));
    assert.equal(parsed.checks.every((check) => check.repair.length > 0), true);
    assert.match(textResult.stdout, /repair:/u);
    assert.match(textResult.stdout, /remote security/u);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("dream smoke creates its probe root when config home does not exist", async () => {
  const parent = await mkdtemp(join(tmpdir(), "dream-smoke-missing-parent-"));
  try {
    const result = await runDream(["smoke", "--json"], join(parent, "missing-home"));

    assert.equal(result.code, 0);
    const parsed = smokeJsonSchema.parse(JSON.parse(result.stdout));
    assert.equal(parsed.checks.some((check) => check.id === "session-store" && check.status === "pass"), true);
    assert.equal(parsed.checks.some((check) => check.id === "checkpoint-store" && check.status === "pass"), true);
  } finally {
    await rm(parent, { recursive: true, force: true });
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
