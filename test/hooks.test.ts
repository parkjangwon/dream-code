import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { formatHooksStatus, hooksLogFilePath, loadHooks, runHookEvent } from "../src/hooks.js";
import { stripAnsi } from "../src/ansi.js";

test("loadHooks parses enabled TOML hook blocks", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-hooks-"));
  try {
    await writeFile(join(root, "hooks.toml"), [
      "[[hook]]",
      "event = \"postTool\"",
      "command = \"echo done\"",
      "enabled = true",
      "",
      "[[hook]]",
      "event = \"preTool\"",
      "command = \"echo skipped\"",
      "enabled = false",
    ].join("\n"), "utf8");

    const hooks = await loadHooks(root);

    assert.equal(hooks.length, 2);
    assert.equal(hooks[0]?.event, "postTool");
    assert.equal(hooks[1]?.enabled, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runHookEvent executes matching hooks with metadata env", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-hooks-run-"));
  try {
    const outputFile = join(root, "hook.out");
    await writeFile(join(root, "hooks.toml"), [
      "[[hook]]",
      "event = \"postTool\"",
      `command = "printf $DREAM_TOOL > ${outputFile}"`,
      "enabled = true",
    ].join("\n"), "utf8");

    const results = await runHookEvent(root, "postTool", { tool: "read", ok: "true" });

    assert.equal(results[0]?.ok, true);
    assert.equal(await readFile(outputFile, "utf8"), "read");
    assert.match(await readFile(hooksLogFilePath(root), "utf8"), /postTool/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatHooksStatus shows recent hook runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-hooks-recent-"));
  try {
    await writeFile(join(root, "hooks.toml"), [
      "[[hook]]",
      "event = \"postCommand\"",
      "command = \"echo ok\"",
      "enabled = true",
    ].join("\n"), "utf8");
    await runHookEvent(root, "postCommand", { command: "/status" });

    const status = stripAnsi(await formatHooksStatus(root));

    assert.match(status, /Recent runs/u);
    assert.match(status, /postCommand/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatHooksStatus renders missing config without failing", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-hooks-status-"));
  try {
    const status = stripAnsi(await formatHooksStatus(root));

    assert.match(status, /Hooks/u);
    assert.match(status, /No hooks configured/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
