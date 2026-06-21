import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { defaultConfig, loadConfig } from "../src/config.js";
import { writeProviderCredential } from "../src/credentials.js";
import { saveModelCatalog } from "../src/model-catalog.js";
import { apiKeyEnvKeys, listProviderDefinitions } from "../src/provider-registry.js";
import { configureModels } from "../src/tui-model-commands.js";
import { startModelListServer } from "./model-server-fixture.js";

test("configureModels prefers cached catalog models over registry models", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-model-catalog-"));
  const restoreEnv = clearEnvKeys(allProviderApiKeyEnvKeys());
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    await saveModelCatalog(root, {
      version: 1,
      providers: {
        "opencode-go": {
          provider: "opencode-go",
          fetchedAt: "2026-06-21T00:00:00.000Z",
          source: "live",
          models: ["catalog-fast", "catalog-pro"],
        },
      },
    });

    const nextConfig = await configureModels({
      config: configWithOpenCodeGo(),
      configRoot: root,
      args: "",
      questioner: {
        question: async () => "",
        select: async (options) => {
          assert.equal(options.choices.some((choice) => choice.value === "catalog-fast"), true);
          assert.equal(options.choices.some((choice) => choice.value === "hy3-preview"), false);
          return "catalog-fast";
        },
      },
    });

    assert.equal(nextConfig.model.single.models.mid, "catalog-fast");
  } finally {
    stdout.mock.restore();
    restoreEnv();
    await rm(root, { recursive: true, force: true });
  }
});

test("configureModels refreshes live models for any connected provider", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-model-live-"));
  const restoreEnv = clearEnvKeys(allProviderApiKeyEnvKeys());
  const stdout = mock.method(process.stdout, "write", () => true);
  const server = await startModelListServer(["qwen-live-lite", "qwen-live-max"]);
  try {
    await writeProviderCredential(root, "qwen", {
      apiKey: "sk-qwen",
      baseUrl: server.baseUrl,
    });

    const nextConfig = await configureModels({
      config: configWithQwen(),
      configRoot: root,
      args: "",
      questioner: {
        question: async () => "",
        select: async (options) => {
          assert.equal(options.title, "Models Qwen / DashScope");
          assert.equal(options.choices.some((choice) => choice.value === "qwen-live-max"), true);
          assert.equal(options.choices.some((choice) => choice.value === "qwen3.7-max"), true);
          return "qwen-live-max";
        },
      },
    });

    assert.equal(nextConfig.model.single.models.mid, "qwen-live-max");
    assert.equal((await loadConfig(root)).model.single.models.mid, "qwen-live-max");
  } finally {
    stdout.mock.restore();
    restoreEnv();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("configureModels hides non-Codex OAuth OpenAI models", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-model-openai-oauth-"));
  const restoreEnv = clearEnvKeys(allProviderApiKeyEnvKeys());
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    await writeProviderCredential(root, "openai", {
      authMode: "oauth",
      region: "chatgpt",
      baseUrl: "https://chatgpt.com/backend-api/codex",
    });

    await configureModels({
      config: defaultConfig(),
      configRoot: root,
      args: "",
      questioner: {
        question: async () => "",
        select: async (options) => {
          assert.equal(options.choices.some((choice) => choice.value === "gpt-5.5"), true);
          assert.equal(options.choices.some((choice) => choice.value === "gpt-5.4-mini"), true);
          assert.equal(options.choices.some((choice) => choice.value === "gpt-5.5-pro"), false);
          assert.equal(options.choices.some((choice) => choice.value === "gpt-5.3-codex"), false);
          return undefined;
        },
      },
    });
  } finally {
    stdout.mock.restore();
    restoreEnv();
    await rm(root, { recursive: true, force: true });
  }
});

function configWithOpenCodeGo(): ReturnType<typeof defaultConfig> {
  const config = defaultConfig();
  return {
    ...config,
    model: {
      ...config.model,
      mode: "single",
      single: {
        provider: "opencode-go",
        models: {
          low: "deepseek-v4-flash",
          mid: "kimi-k2.7-code",
          high: "glm-5.2",
        },
        defaultTier: "mid",
      },
    },
  };
}

function configWithQwen(): ReturnType<typeof defaultConfig> {
  const config = defaultConfig();
  return {
    ...config,
    model: {
      ...config.model,
      mode: "single",
      single: {
        provider: "qwen",
        models: {
          low: "qwen3.6-plus",
          mid: "qwen3.7-plus",
          high: "qwen3.7-max",
        },
        defaultTier: "mid",
      },
    },
  };
}

function clearEnvKeys(keys: readonly string[]): () => void {
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function allProviderApiKeyEnvKeys(): readonly string[] {
  return [...new Set(listProviderDefinitions().flatMap(apiKeyEnvKeys))];
}
