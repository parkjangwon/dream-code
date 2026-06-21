import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { defaultConfig, loadConfig } from "../src/config.js";
import { writeProviderCredential } from "../src/credentials.js";
import { configureModels } from "../src/tui-model-commands.js";

test("configureModels sets the active tier from command args", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-models-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const nextConfig = await configureModels({
      config: configWithOpenCodeGo(),
      configRoot: root,
      args: "high",
      questioner: { question: async () => "" },
    });
    const saved = await loadConfig(root);

    assert.equal(nextConfig.model.single.defaultTier, "high");
    assert.equal(saved.model.single.defaultTier, "high");
    assert.equal(saved.model.single.models.high, "glm-5.2");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("configureModels edits a tier model from command args", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-models-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const nextConfig = await configureModels({
      config: configWithOpenCodeGo(),
      configRoot: root,
      args: "mid opencode-go/kimi-k2.7-code",
      questioner: { question: async () => "" },
    });

    assert.equal(nextConfig.model.single.defaultTier, "mid");
    assert.equal(nextConfig.model.single.models.mid, "kimi-k2.7-code");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("configureModels prompts for a tier when no args are supplied", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-models-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const prompts: string[] = [];
    const nextConfig = await configureModels({
      config: configWithOpenCodeGo(),
      configRoot: root,
      args: "",
      questioner: {
        question: async (prompt) => {
          prompts.push(prompt);
          return "low";
        },
      },
    });

    assert.deepEqual(prompts, ["Model: "]);
    assert.equal(nextConfig.model.single.defaultTier, "low");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("configureModels selects any provider model through the picker", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-models-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const nextConfig = await configureModels({
      config: configWithOpenCodeGo(),
      configRoot: root,
      args: "",
      questioner: {
        question: async () => "",
        select: async (options) => {
          assert.equal(options.title, "Models OpenCode Go");
          assert.equal(options.choices.some((choice) => choice.value === "hy3-preview"), true);
          return "hy3-preview";
        },
      },
    });

    assert.equal(nextConfig.model.single.defaultTier, "mid");
    assert.equal(nextConfig.model.single.models.mid, "hy3-preview");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("configureModels lists extended OpenAI models through the picker", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-models-"));
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
          assert.equal(options.choices.some((choice) => choice.value === "gpt-5.4-pro"), true);
          assert.equal(options.choices.some((choice) => choice.value === "gpt-5.3-codex"), true);
          return "gpt-5.3-codex";
        },
      },
    });

    assert.equal(nextConfig.model.single.defaultTier, "mid");
    assert.equal(nextConfig.model.single.models.mid, "gpt-5.3-codex");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("configureModels toggles multi-provider auto mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-models-auto-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    await writeProviderCredential(root, "deepseek", {
      apiKey: "sk-deepseek",
      region: "global",
      baseUrl: "https://api.deepseek.com",
    });
    const nextConfig = await configureModels({
      config: configWithOpenAi(),
      configRoot: root,
      args: "auto",
      questioner: { question: async () => "" },
    });

    assert.equal(nextConfig.model.mode, "auto");
    assert.equal(nextConfig.model.auto.categories?.[0]?.candidates[0]?.startsWith("deepseek/"), true);
    assert.equal(nextConfig.model.auto.agentRoutes?.some((route) => route.agent === "tech-lead"), true);
    assert.equal((await loadConfig(root)).model.mode, "auto");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("configureModels previews multi-provider routes with connected providers", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-models-route-"));
  const chunks: string[] = [];
  const restoreEnv = clearEnvKeys(["GEMINI_API_KEY", "GOOGLE_API_KEY", "DREAM_GEMINI_API_KEY"]);
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await writeFile(join(root, "credentials.json"), JSON.stringify({
      version: 1,
      providers: {
        openai: { authMode: "api-key", apiKey: "test-key" },
      },
    }), "utf8");

    await configureModels({
      config: { ...configWithOpenAi(), model: { ...configWithOpenAi().model, mode: "auto" } },
      configRoot: root,
      args: "route Polish this React layout",
      questioner: { question: async () => "" },
    });

    assert.match(chunks.join(""), /route: visual -> openai\/gpt-5\.5/u);
  } finally {
    stdout.mock.restore();
    restoreEnv();
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
        models: {
          low: "gpt-5.4-nano",
          mid: "gpt-5.4-mini",
          high: "gpt-5.5",
        },
        defaultTier: "mid",
      },
    },
  };
}

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
