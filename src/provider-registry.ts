export type ProviderProtocol = "chat-completions" | "responses";
export type ApiKeyHeader = "authorization" | "api-key";

export type ProviderRegion = {
  readonly id: string;
  readonly label: string;
  readonly baseUrl: string;
};

export type ProviderTierModels = {
  readonly low: string;
  readonly mid: string;
  readonly high: string;
};

export type ProviderAuthMode = "api-key" | "oauth" | "none";

export type ProviderDefinition = {
  readonly id: string;
  readonly displayName: string;
  readonly protocol: ProviderProtocol;
  readonly apiKeyHeader: ApiKeyHeader;
  readonly envKeys: readonly string[];
  readonly regions: readonly ProviderRegion[];
  readonly defaultRegion: string;
  readonly defaultModels: ProviderTierModels;
  readonly availableModels: readonly string[];
  readonly auth: readonly ProviderAuthMode[];
  readonly docsUrl: string;
};

const providerAliases: Readonly<Record<string, string>> = {
  alibaba: "qwen",
  dashscope: "qwen",
  deepseekai: "deepseek",
  firework: "fireworks",
  glm: "z-ai",
  google: "gemini",
  "kimi-code": "kimi",
  minimaxi: "minimax",
  mimo: "xiaomi-mimo",
  moonshot: "kimi",
  "openai-compatible": "custom-openai",
  opencodego: "opencode-go",
  opencodezen: "opencode-zen",
  local: "ollama",
  xiaomi: "xiaomi-mimo",
  zai: "z-ai",
};

const openCodeGoModels = [
  "minimax-m3",
  "minimax-m2.7",
  "minimax-m2.5",
  "kimi-k2.7-code",
  "kimi-k2.6",
  "kimi-k2.5",
  "glm-5.2",
  "glm-5.1",
  "glm-5",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "qwen3.7-max",
  "qwen3.7-plus",
  "qwen3.6-plus",
  "qwen3.5-plus",
  "mimo-v2-pro",
  "mimo-v2-omni",
  "mimo-v2.5-pro",
  "mimo-v2.5",
  "hy3-preview",
] as const;

const openAiModels = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex-spark",
  "gpt-5.3",
  "gpt-5.2",
  "gpt-5.1",
  "gpt-5",
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.1-codex",
  "gpt-5-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
] as const;

const openRouterModels = [
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-flash:free",
  "deepseek/deepseek-v3.2",
  "z-ai/glm-5.2",
  "z-ai/glm-5",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.5",
] as const;

const sakanaModels = [
  "fugu",
  "fugu-ultra",
  "fugu-ultra-20260615",
] as const;

export const providerDefinitions = [
  define("openai", "OpenAI", "chat-completions", "authorization", ["OPENAI_API_KEY"], [
    region("global", "Global", "https://api.openai.com/v1"),
  ], "global", models("gpt-5.4-mini", "gpt-5.5", "gpt-5.5"), ["api-key", "oauth"], "https://developers.openai.com/codex/models", openAiModels),
  define("deepseek", "DeepSeek", "chat-completions", "authorization", ["DEEPSEEK_API_KEY"], [
    region("global", "Global", "https://api.deepseek.com"),
  ], "global", models("deepseek-v4-flash", "deepseek-v4-pro", "deepseek-v4-pro"), ["api-key"], "https://api-docs.deepseek.com/"),
  define("opencode-go", "OpenCode Go", "chat-completions", "authorization", ["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"], [
    region("global", "Global", "https://opencode.ai/zen/go/v1"),
  ], "global", models("deepseek-v4-flash", "kimi-k2.7-code", "glm-5.2"), ["api-key"], "https://opencode.ai/docs/go/", openCodeGoModels),
  define("opencode-zen", "OpenCode Zen", "responses", "authorization", ["OPENCODE_ZEN_API_KEY", "OPENCODE_API_KEY"], [
    region("global", "Global", "https://opencode.ai/zen/v1"),
  ], "global", models("gpt-5.4-mini", "gpt-5.5", "gpt-5.5"), ["api-key"], "https://opencode.ai/docs/zen/"),
  define("minimax", "MiniMax", "chat-completions", "authorization", ["MINIMAX_API_KEY"], [
    region("global", "International", "https://api.minimax.io/v1"),
    region("cn", "China", "https://api.minimaxi.com/v1"),
  ], "global", models("MiniMax-M2.7-highspeed", "MiniMax-M3", "MiniMax-M3"), ["api-key"], "https://platform.minimax.io/docs/token-plan/cursor"),
  define("kimi", "Kimi", "chat-completions", "authorization", ["KIMI_API_KEY", "MOONSHOT_API_KEY"], [
    region("global", "Global", "https://api.moonshot.ai/v1"),
    region("cn", "China", "https://api.moonshot.cn/v1"),
    region("coding", "Coding", "https://api.kimi.com/coding/v1"),
  ], "global", models("kimi-k2.6", "kimi-k2.7-code", "kimi-k2.7-code"), ["api-key"], "https://platform.kimi.ai/docs/guide/start-using-kimi-api"),
  define("z-ai", "Z.ai", "chat-completions", "authorization", ["Z_AI_API_KEY", "ZAI_API_KEY", "GLM_API_KEY"], [
    region("coding", "Coding Plan", "https://api.z.ai/api/coding/paas/v4"),
  ], "coding", models("glm-5.2", "glm-5.2", "glm-5.2"), ["api-key"], "https://docs.z.ai/devpack/tool/others"),
  define("gemini", "Gemini", "chat-completions", "authorization", ["GOOGLE_API_KEY", "GEMINI_API_KEY"], [
    region("global", "Global", "https://generativelanguage.googleapis.com/v1beta/openai"),
  ], "global", models("gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.5-flash"), ["api-key"], "https://ai.google.dev/gemini-api/docs/models"),
  define("xiaomi-mimo", "Xiaomi MiMo", "chat-completions", "api-key", ["MIMO_API_KEY", "XIAOMI_MIMO_API_KEY"], [
    region("payg", "Pay As You Go", "https://api.xiaomimimo.com/v1"),
    region("token-cn", "Token Plan China", "https://token-plan-cn.xiaomimimo.com/v1"),
  ], "payg", models("mimo-v2.5", "mimo-v2.5-pro", "mimo-v2.5-pro"), ["api-key"], "https://mimo.mi.com/docs/en-US/api/chat/openai-api"),
  define("openrouter", "OpenRouter", "chat-completions", "authorization", ["OPENROUTER_API_KEY"], [
    region("global", "Global", "https://openrouter.ai/api/v1"),
  ], "global", models("deepseek/deepseek-v4-flash", "z-ai/glm-5.2", "z-ai/glm-5.2"), ["api-key"], "https://openrouter.ai/docs/quickstart", openRouterModels),
  define("sakana", "Sakana Fugu", "chat-completions", "authorization", ["SAKANA_API_KEY"], [
    region("console", "Console endpoint", ""),
  ], "console", models("fugu", "fugu", "fugu-ultra"), ["api-key"], "https://sakana.ai/fugu/", sakanaModels),
  define("ollama", "Ollama", "chat-completions", "authorization", [], [
    region("local", "Local", "http://127.0.0.1:11434/v1"),
  ], "local", models("llama3.2", "llama3.2", "llama3.2"), ["none"], "https://github.com/ollama/ollama/blob/main/docs/api.md"),
  define("groq", "Groq", "chat-completions", "authorization", ["GROQ_API_KEY"], [
    region("global", "Global", "https://api.groq.com/openai/v1"),
  ], "global", models("llama-3.3-70b-versatile", "openai/gpt-oss-20b", "openai/gpt-oss-120b"), ["api-key"], "https://console.groq.com/docs/models"),
  define("xai", "xAI", "chat-completions", "authorization", ["XAI_API_KEY"], [
    region("global", "Global", "https://api.x.ai/v1"),
  ], "global", models("grok-4.3-fast", "grok-4.3", "grok-4.3"), ["api-key"], "https://docs.x.ai/developers/quickstart"),
  define("mistral", "Mistral", "chat-completions", "authorization", ["MISTRAL_API_KEY"], [
    region("global", "Global", "https://api.mistral.ai/v1"),
  ], "global", models("mistral-small-4", "devstral-2", "mistral-medium-3-5"), ["api-key"], "https://docs.mistral.ai/models/overview"),
  define("together", "Together AI", "chat-completions", "authorization", ["TOGETHER_API_KEY"], [
    region("global", "Global", "https://api.together.xyz/v1"),
  ], "global", models("Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8", "Qwen/Qwen3.7-Max", "zai-org/GLM-5.2"), ["api-key"], "https://docs.together.ai/docs/inference/openai-compatibility"),
  define("fireworks", "Fireworks AI", "chat-completions", "authorization", ["FIREWORKS_API_KEY"], [
    region("global", "Global", "https://api.fireworks.ai/inference/v1"),
  ], "global", models("accounts/fireworks/models/llama-v3p3-70b-instruct", "accounts/fireworks/models/qwen3-coder-480b-a35b-instruct", "accounts/fireworks/models/deepseek-v4-pro"), ["api-key"], "https://docs.fireworks.ai/tools-sdks/openai-compatibility"),
  define("cerebras", "Cerebras", "chat-completions", "authorization", ["CEREBRAS_API_KEY"], [
    region("global", "Global", "https://api.cerebras.ai/v1"),
  ], "global", models("llama-3.3-70b", "qwen-3-coder-480b", "zai-glm-4.7"), ["api-key"], "https://inference-docs.cerebras.ai/models/overview"),
  define("qwen", "Qwen / DashScope", "chat-completions", "authorization", ["DASHSCOPE_API_KEY", "QWEN_API_KEY"], [
    region("sg", "Singapore", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"),
    region("us", "US Virginia", "https://dashscope-us.aliyuncs.com/compatible-mode/v1"),
    region("cn", "China Beijing", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
    region("hk", "Hong Kong", "https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1"),
  ], "sg", models("qwen3.6-plus", "qwen3.7-plus", "qwen3.7-max"), ["api-key"], "https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope"),
  define("custom-openai", "Custom OpenAI Compatible", "chat-completions", "authorization", ["CUSTOM_OPENAI_API_KEY"], [
    region("custom", "Custom", ""),
  ], "custom", models("model-low", "model-mid", "model-high"), ["api-key"], "https://platform.openai.com/docs/api-reference/chat/create"),
] as const satisfies readonly ProviderDefinition[];

export function listProviderDefinitions(): readonly ProviderDefinition[] {
  return providerDefinitions;
}

export function resolveProviderDefinition(provider: string): ProviderDefinition | undefined {
  const normalized = normalizeProviderId(provider);
  const targetId = providerAliases[normalized] ?? normalized;
  return providerDefinitions.find((definition) => definition.id === targetId);
}

export function providerEnvName(providerId: string): string {
  return providerId.replace(/[^a-z0-9]/gu, "_").toUpperCase();
}

export function apiKeyEnvKeys(definition: ProviderDefinition): readonly string[] {
  if (!definition.auth.includes("api-key")) {
    return [];
  }
  return [`DREAM_${providerEnvName(definition.id)}_API_KEY`, ...definition.envKeys];
}

export function baseUrlEnvKeys(definition: ProviderDefinition): readonly string[] {
  return [`DREAM_${providerEnvName(definition.id)}_BASE_URL`];
}

export function regionForProvider(
  definition: ProviderDefinition,
  regionId?: string,
): ProviderRegion | undefined {
  const id = regionId ?? definition.defaultRegion;
  return definition.regions.find((candidate) => candidate.id === id);
}

export function providerModelIdForRequest(providerId: string, model: string): string {
  if (providerId !== "opencode-go") {
    return model;
  }

  const rawModel = model.startsWith("opencode-go/")
    ? model.slice("opencode-go/".length)
    : model;
  return rawModel === "kimi-k2.7" ? "kimi-k2.7-code" : rawModel;
}

function define(
  id: string,
  displayName: string,
  protocol: ProviderProtocol,
  apiKeyHeader: ApiKeyHeader,
  envKeys: readonly string[],
  regions: readonly ProviderRegion[],
  defaultRegion: string,
  defaultModels: ProviderTierModels,
  auth: readonly ProviderAuthMode[],
  docsUrl: string,
  availableModels?: readonly string[],
): ProviderDefinition {
  return {
    id,
    displayName,
    protocol,
    apiKeyHeader,
    envKeys,
    regions,
    defaultRegion,
    defaultModels,
    availableModels: availableModels ?? uniqueModels(defaultModels),
    auth,
    docsUrl,
  };
}

function models(low: string, mid: string, high: string): ProviderTierModels {
  return { low, mid, high };
}

function uniqueModels(tierModels: ProviderTierModels): readonly string[] {
  return [...new Set([tierModels.low, tierModels.mid, tierModels.high])];
}

function normalizeProviderId(provider: string): string {
  return provider.trim().toLowerCase().replace(/_/gu, "-");
}

function region(id: string, label: string, baseUrl: string): ProviderRegion {
  return { id, label, baseUrl };
}
