import test from "node:test";
import assert from "node:assert/strict";

import {
  apiKeyEnvKeys,
  baseUrlEnvKeys,
  providerModelIdForRequest,
  regionForProvider,
  resolveProviderDefinition,
} from "../src/provider-registry.js";

test("resolveProviderDefinition maps aliases to canonical providers", () => {
  const kimi = resolveProviderDefinition("moonshot");
  const mimo = resolveProviderDefinition("xiaomi");

  assert.equal(kimi?.id, "kimi");
  assert.equal(mimo?.id, "xiaomi-mimo");
});

test("provider registry keeps official regional base URLs", () => {
  const kimi = resolveProviderDefinition("kimi");
  const minimax = resolveProviderDefinition("minimax");
  const qwen = resolveProviderDefinition("qwen");

  assert.equal(regionForProvider(required(kimi), "cn")?.baseUrl, "https://api.moonshot.cn/v1");
  assert.equal(regionForProvider(required(minimax), "cn")?.baseUrl, "https://api.minimaxi.com/v1");
  assert.equal(
    regionForProvider(required(qwen), "us")?.baseUrl,
    "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
  );
});

test("provider registry exposes Dream Code env overrides", () => {
  const zAi = required(resolveProviderDefinition("zai"));

  assert.deepEqual(apiKeyEnvKeys(zAi).slice(0, 2), ["DREAM_Z_AI_API_KEY", "Z_AI_API_KEY"]);
  assert.deepEqual(baseUrlEnvKeys(zAi), ["DREAM_Z_AI_BASE_URL"]);
});

test("OpenCode Zen uses the Responses protocol", () => {
  const zen = required(resolveProviderDefinition("opencode-zen"));

  assert.equal(zen.protocol, "responses");
});

test("OpenCode Go defaults use direct API model IDs", () => {
  const go = required(resolveProviderDefinition("opencode-go"));

  assert.deepEqual(go.defaultModels, {
    low: "deepseek-v4-flash",
    mid: "kimi-k2.7-code",
    high: "glm-5.2",
  });
  assert.equal(go.availableModels.includes("hy3-preview"), true);
  assert.equal(go.availableModels.includes("kimi-k2.7-code"), true);
  assert.equal(go.availableModels.length >= 20, true);
});

test("provider defaults track official coding model tiers", () => {
  const openai = required(resolveProviderDefinition("openai"));
  const zen = required(resolveProviderDefinition("opencode-zen"));
  const qwen = required(resolveProviderDefinition("qwen"));
  const cerebras = required(resolveProviderDefinition("cerebras"));
  const together = required(resolveProviderDefinition("together"));
  const openrouter = required(resolveProviderDefinition("openrouter"));

  assert.deepEqual(openai.defaultModels, {
    low: "gpt-5.4-mini",
    mid: "gpt-5.5",
    high: "gpt-5.5",
  });
  assert.equal(openai.availableModels.includes("gpt-5.4"), true);
  assert.equal(openai.availableModels.includes("gpt-5.3-codex-spark"), true);
  assert.deepEqual(zen.defaultModels, openai.defaultModels);
  assert.equal(qwen.defaultModels.high, "qwen3.7-max");
  assert.equal(cerebras.defaultModels.high, "zai-glm-4.7");
  assert.equal(together.defaultModels.high, "zai-org/GLM-5.2");
  assert.deepEqual(openrouter.defaultModels, {
    low: "deepseek/deepseek-v4-flash",
    mid: "z-ai/glm-5.2",
    high: "z-ai/glm-5.2",
  });
});

test("Sakana Fugu is available as an OpenAI-compatible orchestration provider", () => {
  const sakana = required(resolveProviderDefinition("sakana"));

  assert.equal(sakana.protocol, "chat-completions");
  assert.deepEqual(sakana.defaultModels, {
    low: "fugu",
    mid: "fugu",
    high: "fugu-ultra",
  });
  assert.deepEqual(apiKeyEnvKeys(sakana).slice(0, 2), ["DREAM_SAKANA_API_KEY", "SAKANA_API_KEY"]);
  assert.equal(regionForProvider(sakana, "console")?.baseUrl, "");
});

test("providerModelIdForRequest normalizes existing OpenCode Go config model IDs", () => {
  assert.equal(
    providerModelIdForRequest("opencode-go", "opencode-go/kimi-k2.7-code"),
    "kimi-k2.7-code",
  );
  assert.equal(providerModelIdForRequest("opencode-go", "kimi-k2.7"), "kimi-k2.7-code");
  assert.equal(providerModelIdForRequest("opencode-go", "opencode-go/glm-5.2"), "glm-5.2");
});

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    assert.fail("expected provider definition");
  }
  return value;
}
