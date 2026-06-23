import assert from "node:assert/strict";
import test from "node:test";

import { assertShellCommandAllowed, parseShellCommand, runCapturedCommand } from "../src/shell-command.js";

test("parseShellCommand preserves quoted arguments without invoking a shell", () => {
  const parsed = parseShellCommand("node -e \"console.log('hello world')\"");

  assert.equal(parsed.executable, "node");
  assert.deepEqual(parsed.args, ["-e", "console.log('hello world')"]);
});

test("runCapturedCommand executes allowlisted commands without shell expansion", async () => {
  const result = await runCapturedCommand("node -e \"console.log(process.env.DREAM_VALUE)\"", {
    env: { ...process.env, DREAM_VALUE: "safe" },
  });

  assert.equal(result.ok, true);
  assert.match(result.output, /safe/u);
});

test("assertShellCommandAllowed blocks shell metacharacters", () => {
  assert.throws(
    () => assertShellCommandAllowed("echo ok && echo bad"),
    /shell metacharacter blocked/u,
  );
});

test("assertShellCommandAllowed blocks non-allowlisted executables", () => {
  assert.throws(
    () => assertShellCommandAllowed("curl https://example.com"),
    /not allowlisted/u,
  );
});

test("assertShellCommandAllowed accepts a caller supplied allowlist", () => {
  const parsed = assertShellCommandAllowed("curl https://example.com", {
    allowedExecutables: ["curl"],
  });

  assert.equal(parsed.executable, "curl");
});

test("runCapturedCommand uses a caller supplied allowlist", async () => {
  const result = await runCapturedCommand("node -e \"console.log('custom')\"", {
    allowedExecutables: ["node"],
  });

  assert.equal(result.ok, true);
  assert.match(result.output, /custom/u);
});
