import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { defaultConfig, loadConfig } from "../src/config.js";
import { handleInput } from "../src/tui.js";

test("handleInput routes /model to model selection instead of status output", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tui-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const result = await handleInput(
      "/model high",
      defaultConfig(),
      { oneShotYolo: true, configRoot: root },
      { question: async () => "" },
    );
    const saved = await loadConfig(root);

    assert.equal(result.config.model.single.defaultTier, "high");
    assert.equal(saved.model.single.defaultTier, "high");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});
