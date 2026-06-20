import { z } from "zod";

export const modelTierSchema = z.enum(["low", "mid", "high"]);
export type ModelTier = z.infer<typeof modelTierSchema>;

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

export const modelConfigSchema = z.object({
  mode: z.enum(["single", "auto"]),
  single: singleProviderModelConfigSchema,
  auto: z.object({
    routes: z.array(autoModelRouteSchema),
  }),
});

export type ModelConfig = z.infer<typeof modelConfigSchema>;

export type SelectedModel = {
  readonly provider: string;
  readonly model: string;
  readonly tier: ModelTier;
  readonly reason: string;
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
): SelectedModel {
  switch (config.mode) {
    case "single":
      return selectSingleProviderModel(config.single, requestedTier);
    case "auto":
      return selectAutoModel(config, prompt, requestedTier);
    default:
      return assertNever(config.mode);
  }
}

export function describeModelMode(config: ModelConfig): string {
  switch (config.mode) {
    case "single":
      return `single provider: ${config.single.provider} (${config.single.defaultTier} default, low/mid/high tiers configured)`;
    case "auto":
      return `auto model routing: ${config.auto.routes.length} route(s) configured`;
    default:
      return assertNever(config.mode);
  }
}

function selectAutoModel(
  config: ModelConfig,
  prompt: string,
  requestedTier?: ModelTier,
): SelectedModel {
  const normalizedPrompt = prompt.toLowerCase();
  const matchedRoute = config.auto.routes.find((route) => {
    return route.match.some((keyword) => normalizedPrompt.includes(keyword.toLowerCase()));
  });

  if (matchedRoute !== undefined && requestedTier === undefined) {
    return {
      provider: matchedRoute.provider,
      model: matchedRoute.model,
      tier: matchedRoute.tier,
      reason: `auto route: ${matchedRoute.id}`,
    };
  }

  return {
    ...selectSingleProviderModel(config.single, requestedTier),
    reason: "auto routing fallback",
  };
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
