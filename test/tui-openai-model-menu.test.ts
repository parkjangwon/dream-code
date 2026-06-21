import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { defaultConfig } from "../src/config.js";
import { configureModels } from "../src/tui-model-commands.js";

test("configureModels lists current Codex OpenAI models through the picker", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-openai-models-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const nextConfig = await configureModels({
      config: configWithOpenAi(),
      configRoot: root,
      args: "",
      questioner: {
        question: async () => "",
        select: async (options) => {
          assert.equal(options.title, "Models OpenAI");
          assert.equal(options.choices.some((choice) => choice.value === "gpt-5.4"), true);
          assert.equal(options.choices.some((choice) => choice.value === "gpt-5.3-codex-spark"), true);
          return "gpt-5.4";
        },
      },
    });

    assert.equal(nextConfig.model.single.defaultTier, "mid");
    assert.equal(nextConfig.model.single.models.mid, "gpt-5.4");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

function configWithOpenAi(): ReturnType<typeof defaultConfig> {
  const config = defaultConfig();
  return {
    ...config,
    model: {
      ...config.model,
      mode: "single",
      single: {
        provider: "openai",
        models: { low: "gpt-5.4-mini", mid: "gpt-5.5", high: "gpt-5.5" },
        defaultTier: "mid",
      },
    },
  };
}
