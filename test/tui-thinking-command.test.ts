import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { defaultConfig, loadConfig } from "../src/config.js";
import { configureThinking } from "../src/tui-thinking-command.js";
import { runWorkspaceCommand } from "../src/tui-workspace-commands.js";

test("configureThinking saves manual reasoning effort", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-thinking-command-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const config = await configureThinking({
      config: defaultConfig(),
      configRoot: root,
      args: "xhigh",
    });
    const saved = await loadConfig(root);

    assert.equal(config.model.reasoning?.effort, "xhigh");
    assert.equal(saved.model.reasoning?.effort, "xhigh");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("configureThinking keeps unknown efforts unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-thinking-unknown-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const config = await configureThinking({
      config: defaultConfig(),
      configRoot: root,
      args: "galaxy",
    });

    assert.equal(config.model.reasoning?.effort, "auto");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand routes /think to reasoning configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-thinking-route-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const result = await runWorkspaceCommand(
      "/think high",
      defaultConfig(),
      true,
      { question: async () => "" },
      root,
    );

    assert.equal(result.config.model.reasoning?.effort, "high");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});
