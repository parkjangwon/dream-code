import { z } from "zod";

export const modelTierSchema = z.enum(["low", "mid", "high"]);
export type ModelTier = z.infer<typeof modelTierSchema>;
export const autoModelCategorySchema = z.enum([
  "quick",
  "reader",
  "visual",
  "deep",
  "ultrabrain",
  "writing",
  "architect",
  "executor",
]);
export type AutoModelCategory = z.infer<typeof autoModelCategorySchema>;

export const singleProviderModelConfigSchema = z.object({
  provider: z.string().min(1),
  models: z.object({
    low: z.string().min(1),
    mid: z.string().min(1),
    high: z.string().min(1),
  }),
  defaultTier: modelTierSchema,
});

export type SingleProviderModelConfig = z.infer<typeof singleProviderModelConfigSchema>;

export const autoModelRouteSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  tier: modelTierSchema,
  match: z.array(z.string().min(1)),
});

export type AutoModelRoute = z.infer<typeof autoModelRouteSchema>;

export const autoModelCategoryRouteSchema = z.object({
  id: autoModelCategorySchema,
  label: z.string().min(1),
  tier: modelTierSchema,
  match: z.array(z.string().min(1)),
  candidates: z.array(z.string().min(1)),
});

export type AutoModelCategoryRoute = z.infer<typeof autoModelCategoryRouteSchema>;

export const modelConfigSchema = z.object({
  mode: z.enum(["single", "auto"]),
  single: singleProviderModelConfigSchema,
  auto: z.object({
    routes: z.array(autoModelRouteSchema),
    categories: z.array(autoModelCategoryRouteSchema).optional(),
    preferConnectedProviders: z.boolean().optional(),
  }),
});

export type ModelConfig = z.infer<typeof modelConfigSchema>;

export type SelectedModel = {
  readonly provider: string;
  readonly model: string;
  readonly tier: ModelTier;
  readonly reason: string;
  readonly category?: AutoModelCategory;
  readonly skipped?: readonly string[];
};

export type SelectModelOptions = {
  readonly connectedProviders?: ReadonlySet<string>;
  readonly unhealthyModels?: ReadonlySet<string>;
};

export function selectSingleProviderModel(
  config: SingleProviderModelConfig,
  requestedTier?: ModelTier,
): SelectedModel {
  const tier = requestedTier ?? config.defaultTier;

  return {
    provider: config.provider,
    model: modelNameForTier(config.models, tier),
    tier,
    reason: "single provider tier selection",
  };
}

export function selectModelForPrompt(
  config: ModelConfig,
  prompt: string,
  requestedTier?: ModelTier,
  options: SelectModelOptions = {},
): SelectedModel {
  switch (config.mode) {
    case "single":
      return selectSingleProviderModel(config.single, requestedTier);
    case "auto":
      return selectAutoModel(config, prompt, requestedTier, options);
    default:
      return assertNever(config.mode);
  }
}

export function describeModelMode(config: ModelConfig): string {
  switch (config.mode) {
    case "single":
      return `single provider: ${config.single.provider} (${config.single.defaultTier} default, low/mid/high tiers configured)`;
    case "auto":
      return `multi-provider auto routing: ${autoCategories(config).length} categories, ${config.auto.routes.length} legacy route(s)`;
    default:
      return assertNever(config.mode);
  }
}

function selectAutoModel(
  config: ModelConfig,
  prompt: string,
  requestedTier?: ModelTier,
  options: SelectModelOptions = {},
): SelectedModel {
  const normalizedPrompt = prompt.toLowerCase();
  const matchedRoute = config.auto.routes.find((route) => {
    return route.match.some((keyword) => normalizedPrompt.includes(keyword.toLowerCase()));
  });

  if (
    matchedRoute !== undefined
    && requestedTier === undefined
    && providerAllowed(matchedRoute.provider, options)
    && !modelUnhealthy(matchedRoute.provider, matchedRoute.model, options)
  ) {
    return {
      provider: matchedRoute.provider,
      model: matchedRoute.model,
      tier: matchedRoute.tier,
      reason: `auto route: ${matchedRoute.id}`,
    };
  }

  if (requestedTier === undefined) {
    const category = classifyPromptCategory(prompt);
    const categoryRoute = autoCategories(config).find((route) => route.id === category);
    if (categoryRoute !== undefined) {
      const selected = selectCategoryCandidate(categoryRoute, options);
      if (selected !== undefined) {
        return selected;
      }
    }
  }

  return {
    ...selectSingleProviderModel(config.single, requestedTier),
    reason: requestedTier === undefined ? "auto routing fallback" : "auto routing forced tier",
  };
}

export function defaultAutoCategories(): readonly AutoModelCategoryRoute[] {
  return [
    categoryRoute("quick", "Quick", "low", ["typo", "rename", "format", "simple", "small", "\uAC04\uB2E8", "\uC624\uD0C0"], [
      "deepseek/deepseek-v4-flash",
      "openai/gpt-5.4-nano",
      "gemini/gemini-3.5-flash",
      "groq/llama-3.3-70b-versatile",
    ]),
    categoryRoute("reader", "Reader", "low", ["analyze", "explain", "summarize", "what is", "how does", "\uBD84\uC11D", "\uC124\uBA85", "\uC694\uC57D"], [
      "gemini/gemini-3.5-flash",
      "deepseek/deepseek-v4-flash",
      "openai/gpt-5.4-mini",
    ]),
    categoryRoute("visual", "Visual", "mid", ["ui", "ux", "css", "react", "html", "layout", "style", "design", "\uD654\uBA74", "\uB514\uC790\uC778", "\uB808\uC774\uC544\uC6C3"], [
      "gemini/gemini-3.5-flash",
      "openai/gpt-5.5",
      "deepseek/deepseek-v4-pro",
    ]),
    categoryRoute("deep", "Deep", "high", ["implement", "debug", "refactor", "fix", "test", "backend", "typescript", "\uAD6C\uD604", "\uC218\uC815", "\uB9AC\uD329\uD130", "\uB514\uBC84\uADF8"], [
      "deepseek/deepseek-v4-pro",
      "openai/gpt-5.3-codex",
      "opencode-go/kimi-k2.7-code",
    ]),
    categoryRoute("ultrabrain", "Ultrabrain", "high", ["architecture", "algorithm", "migration", "threat model", "distributed", "\uC544\uD0A4\uD14D\uCC98", "\uC54C\uACE0\uB9AC\uC998", "\uC124\uACC4"], [
      "openai/gpt-5.5-pro",
      "openai/gpt-5.5",
      "deepseek/deepseek-v4-pro",
    ]),
    categoryRoute("writing", "Writing", "low", ["readme", "docs", "documentation", "release notes", "changelog", "\uBB38\uC11C", "\uAE00"], [
      "gemini/gemini-3.5-flash",
      "openai/gpt-5.4-mini",
      "deepseek/deepseek-v4-flash",
    ]),
    categoryRoute("architect", "Architect", "high", ["/plan", "plan", "design plan", "roadmap", "interview", "\uACC4\uD68D", "\uB85C\uB4DC\uB9F5"], [
      "openai/gpt-5.5-pro",
      "openai/gpt-5.5",
      "deepseek/deepseek-v4-pro",
    ]),
    categoryRoute("executor", "Executor", "low", ["tool result", "command output", "stderr", "stdout", "stack trace", "\uC2E4\uD589 \uACB0\uACFC"], [
      "deepseek/deepseek-v4-flash",
      "openai/gpt-5.4-nano",
      "groq/llama-3.3-70b-versatile",
    ]),
  ];
}

export function classifyPromptCategory(prompt: string): AutoModelCategory {
  const normalized = prompt.toLowerCase();
  for (const route of defaultAutoCategories()) {
    if (route.match.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return route.id;
    }
  }
  return "quick";
}

export function autoCategories(config: ModelConfig): readonly AutoModelCategoryRoute[] {
  return config.auto.categories ?? defaultAutoCategories();
}

export function formatRoutePreview(config: ModelConfig, prompt: string, options: SelectModelOptions = {}): string {
  const selected = selectModelForPrompt({ ...config, mode: "auto" }, prompt, undefined, options);
  const skipped = selected.skipped === undefined || selected.skipped.length === 0
    ? ""
    : `\nskipped: ${selected.skipped.join(", ")}`;
  return `route: ${selected.category ?? "legacy"} -> ${selected.provider}/${selected.model} (${selected.reason})${skipped}`;
}

function selectCategoryCandidate(route: AutoModelCategoryRoute, options: SelectModelOptions): SelectedModel | undefined {
  const skipped: string[] = [];
  for (const spec of route.candidates) {
    const candidate = parseCandidate(spec, route.tier);
    if (candidate === undefined) {
      skipped.push(spec);
      continue;
    }
    if (!providerAllowed(candidate.provider, options)) {
      skipped.push(`${candidate.provider}/${candidate.model}`);
      continue;
    }
    if (modelUnhealthy(candidate.provider, candidate.model, options)) {
      skipped.push(`${candidate.provider}/${candidate.model} unhealthy`);
      continue;
    }
    return {
      ...candidate,
      category: route.id,
      reason: `auto category: ${route.label}`,
      ...(skipped.length === 0 ? {} : { skipped }),
    };
  }
  return undefined;
}

function providerAllowed(provider: string, options: SelectModelOptions): boolean {
  return options.connectedProviders === undefined || options.connectedProviders.has(provider);
}

function modelUnhealthy(provider: string, model: string, options: SelectModelOptions): boolean {
  return options.unhealthyModels?.has(`${provider}/${model}`) ?? false;
}

function parseCandidate(spec: string, tier: ModelTier): Omit<SelectedModel, "reason"> | undefined {
  const separator = spec.indexOf("/");
  if (separator <= 0 || separator >= spec.length - 1) {
    return undefined;
  }
  return {
    provider: spec.slice(0, separator),
    model: spec.slice(separator + 1),
    tier,
  };
}

function categoryRoute(
  id: AutoModelCategory,
  label: string,
  tier: ModelTier,
  match: readonly string[],
  candidates: readonly string[],
): AutoModelCategoryRoute {
  return { id, label, tier, match: [...match], candidates: [...candidates] };
}

function modelNameForTier(
  models: SingleProviderModelConfig["models"],
  tier: ModelTier,
): string {
  switch (tier) {
    case "low":
      return models.low;
    case "mid":
      return models.mid;
    case "high":
      return models.high;
    default:
      return assertNever(tier);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected model routing variant: ${String(value)}`);
}
