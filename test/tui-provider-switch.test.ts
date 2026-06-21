import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { defaultConfig, loadConfig } from "../src/config.js";
import { writeProviderCredential } from "../src/credentials.js";
import { switchProvider } from "../src/tui-provider-switch.js";

test("switchProvider changes to a saved provider without asking for an API key", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-provider-switch-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    await writeProviderCredential(root, "deepseek", {
      apiKey: "sk-deepseek",
      region: "global",
      baseUrl: "https://api.deepseek.com",
    });

    const nextConfig = await switchProvider({
      config: configWithOpenAi(),
      configRoot: root,
      args: "deepseek",
      questioner: { question: async () => "" },
    });
    const saved = await loadConfig(root);

    assert.equal(nextConfig.model.single.provider, "deepseek");
    assert.equal(nextConfig.model.single.models.mid, "deepseek-v4-pro");
    assert.equal(saved.model.single.provider, "deepseek");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("switchProvider picker lists only connected providers", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-provider-switch-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    await writeProviderCredential(root, "deepseek", {
      apiKey: "sk-deepseek",
      region: "global",
      baseUrl: "https://api.deepseek.com",
    });

    const nextConfig = await switchProvider({
      config: configWithOpenAi(),
      configRoot: root,
      args: "",
      env: { GEMINI_API_KEY: "sk-gemini" },
      questioner: {
        question: async () => "",
        select: async (options) => {
          assert.equal(options.title, "Providers");
          assert.equal(options.choices.some((choice) => choice.value === "deepseek"), true);
          assert.equal(options.choices.some((choice) => choice.value === "gemini"), true);
          assert.equal(options.choices.some((choice) => choice.value === "kimi"), false);
          return "deepseek";
        },
      },
    });

    assert.equal(nextConfig.model.single.provider, "deepseek");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("switchProvider hides disabled providers even when env credentials exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-provider-switch-disabled-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    await writeProviderCredential(root, "deepseek", {
      apiKey: "sk-deepseek",
      region: "global",
      baseUrl: "https://api.deepseek.com",
    });

    const nextConfig = await switchProvider({
      config: {
        ...configWithOpenAi(),
        providers: {
          gemini: { enabled: false },
        },
      },
      configRoot: root,
      args: "",
      env: { GEMINI_API_KEY: "sk-gemini" },
      questioner: {
        question: async () => "",
        select: async (options) => {
          assert.equal(options.choices.some((choice) => choice.value === "deepseek"), true);
          assert.equal(options.choices.some((choice) => choice.value === "gemini"), false);
          return "deepseek";
        },
      },
    });

    assert.equal(nextConfig.model.single.provider, "deepseek");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("switchProvider toggles provider availability", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-provider-toggle-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const disabled = await switchProvider({
      config: configWithOpenAi(),
      configRoot: root,
      args: "disable gemini",
      questioner: { question: async () => "" },
    });
    const enabled = await switchProvider({
      config: disabled,
      configRoot: root,
      args: "enable gemini",
      questioner: { question: async () => "" },
    });

    assert.equal(disabled.providers["gemini"]?.enabled, false);
    assert.equal(enabled.providers["gemini"]?.enabled, true);
    assert.equal((await loadConfig(root)).providers["gemini"]?.enabled, true);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("switchProvider manager saves disabled providers and selects enabled providers", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-provider-manager-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    await writeProviderCredential(root, "deepseek", {
      apiKey: "sk-deepseek",
      region: "global",
      baseUrl: "https://api.deepseek.com",
    });

    const nextConfig = await switchProvider({
      config: configWithOpenAi(),
      configRoot: root,
      args: "",
      env: { GEMINI_API_KEY: "sk-gemini" },
      questioner: {
        question: async () => "",
        manageProviders: async (options) => {
          const gemini = options.providers.find((provider) => provider.id === "gemini");
          const deepseek = options.providers.find((provider) => provider.id === "deepseek");
          assert.equal(gemini?.source, "env");
          assert.equal(gemini?.enabled, true);
          assert.equal(deepseek?.source, "saved");
          return { selectedProviderId: "deepseek", disabled: ["gemini"] };
        },
      },
    });
    const saved = await loadConfig(root);

    assert.equal(nextConfig.model.single.provider, "deepseek");
    assert.equal(nextConfig.providers["gemini"]?.enabled, false);
    assert.equal(saved.providers["gemini"]?.enabled, false);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("switchProvider manager saves toggles without selecting disabled providers", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-provider-manager-disabled-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const nextConfig = await switchProvider({
      config: configWithOpenAi(),
      configRoot: root,
      args: "",
      env: { GEMINI_API_KEY: "sk-gemini" },
      questioner: {
        question: async () => "",
        manageProviders: async () => ({ selectedProviderId: "gemini", disabled: ["gemini"] }),
      },
    });

    assert.equal(nextConfig.model.single.provider, "openai");
    assert.equal(nextConfig.providers["gemini"]?.enabled, false);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("switchProvider keeps config unchanged for missing provider credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-provider-switch-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const config = configWithOpenAi();
    const nextConfig = await switchProvider({
      config,
      configRoot: root,
      args: "kimi",
      questioner: { question: async () => "" },
    });

    assert.equal(nextConfig, config);
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
