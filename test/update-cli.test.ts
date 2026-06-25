import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

type CliResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
};

const updateJsonSchema = z.object({
  title: z.literal("Dream Update"),
  currentVersion: z.string(),
  latestVersion: z.string(),
  updateAvailable: z.boolean(),
  action: z.enum(["checked", "failed", "skipped", "updated"]),
  ok: z.boolean(),
  detail: z.string(),
});

test("dream update --check --json reports update status without installing", async () => {
  const result = await runDream(["update", "--check", "--json"]);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  const parsed = updateJsonSchema.parse(JSON.parse(result.stdout));

  assert.equal(parsed.title, "Dream Update");
  assert.equal(parsed.latestVersion, "v0.1.99");
  assert.equal(parsed.updateAvailable, true);
  assert.equal(parsed.action, "checked");
});

function runDream(args: readonly string[]): Promise<CliResult> {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, ["dist/src/cli.js", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, DREAM_UPDATE_LATEST_VERSION: "v0.1.99" },
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
      resolveResult({ stdout, stderr, code });
    });
  });
}
