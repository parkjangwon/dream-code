import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { defaultConfig, loadConfig } from "../src/config.js";
import { runWorkspaceCommand } from "../src/tui-workspace-commands.js";

test("runWorkspaceCommand routes /model to model configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-command-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const result = await runWorkspaceCommand(
      "/model high",
      defaultConfig(),
      true,
      { question: async () => "" },
      root,
    );
    const saved = await loadConfig(root);

    assert.equal(result.config.model.single.defaultTier, "high");
    assert.equal(saved.model.single.defaultTier, "high");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand keeps /models as a legacy model alias", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-command-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const result = await runWorkspaceCommand(
      "/models low",
      defaultConfig(),
      true,
      { question: async () => "" },
      root,
    );

    assert.equal(result.config.model.single.defaultTier, "low");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});
