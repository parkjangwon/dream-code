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

const workdayJsonSchema = z.object({
  title: z.literal("Dream Workday"),
  sections: z.array(z.object({ id: z.string(), status: z.string() })),
});

test("workday dry-run prints actionable workday loop", async () => {
  const home = await mkdtemp(join(tmpdir(), "dream-workday-home-"));
  try {
    const result = await runDream(["workday", "--dry-run"], home);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Dream Workday/u);
    assert.match(result.stdout, /Mode/u);
    assert.match(result.stdout, /Git/u);
    assert.match(result.stdout, /Diagnostics/u);
    assert.match(result.stdout, /Tests/u);
    assert.match(result.stdout, /Smoke/u);
    assert.match(result.stdout, /Release/u);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("workday json dry-run emits parseable plan", async () => {
  const home = await mkdtemp(join(tmpdir(), "dream-workday-json-home-"));
  try {
    const result = await runDream(["workday", "--dry-run", "--json"], home);

    assert.equal(result.code, 0);
    const parsed = workdayJsonSchema.parse(JSON.parse(result.stdout));

    assert.equal(parsed.title, "Dream Workday");
    assert.deepEqual(parsed.sections.map((section) => section.id), [
      "mode",
      "git",
      "diagnostics",
      "tests",
      "smoke",
      "release",
      "next",
    ]);
    assert.equal([...parsed.sections.map((section) => section.status).join("")].some((char) => char.charCodeAt(0) === 27), false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("help lists the workday command without removing existing commands", async () => {
  const home = await mkdtemp(join(tmpdir(), "dream-workday-help-home-"));
  try {
    const result = await runDream(["--help"], home);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /dream workday --dry-run/u);
    assert.match(result.stdout, /dream doctor/u);
    assert.match(result.stdout, /dream cron list/u);
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
