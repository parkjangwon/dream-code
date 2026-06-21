import { z } from "zod";

import {
  autoAgentRoutesImpl,
  autoCategoriesImpl,
  classifyPromptCategoryImpl,
  selectAutoCandidates,
} from "./model-routing-selection.js";
import { defaultReasoningConfig, reasoningEfforts, type ReasoningEffort } from "./reasoning-effort.js";

export const modelTierSchema = z.enum(["low", "mid", "high"]);
export type ModelTier = z.infer<typeof modelTierSchema>;
export const reasoningEffortSchema = z.enum(reasoningEfforts);
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

export const autoModelAgentRouteSchema = z.object({
  agent: z.string().min(1),
  tier: modelTierSchema,
  candidates: z.array(z.string().min(1)),
});

export type AutoModelAgentRoute = z.infer<typeof autoModelAgentRouteSchema>;

export const modelConfigSchema = z.object({
  mode: z.enum(["single", "auto"]),
  reasoning: z.object({
    effort: reasoningEffortSchema,
  }).optional(),
  single: singleProviderModelConfigSchema,
  auto: z.object({
    routes: z.array(autoModelRouteSchema),
    categories: z.array(autoModelCategoryRouteSchema).optional(),
    agentRoutes: z.array(autoModelAgentRouteSchema).optional(),
    preferConnectedProviders: z.boolean().optional(),
  }),
});

export type ModelConfig = z.infer<typeof modelConfigSchema>;

export type SelectedModel = {
  readonly provider: string;
  readonly model: string;
  readonly tier: ModelTier;
  readonly reasoningEffort?: ReasoningEffort;
  readonly reason: string;
  readonly category?: AutoModelCategory;
  readonly agent?: string;
  readonly skipped?: readonly string[];
};

export type SelectModelOptions = {
  readonly connectedProviders?: ReadonlySet<string>;
  readonly unhealthyModels?: ReadonlySet<string>;
  readonly excludedModels?: ReadonlySet<string>;
  readonly agentId?: string;
};

export function selectSingleProviderModel(
  config: SingleProviderModelConfig,
  requestedTier?: ModelTier,
  reasoningEffort?: ReasoningEffort,
): SelectedModel {
  const tier = requestedTier ?? config.defaultTier;

  return {
    provider: config.provider,
    model: modelNameForTier(config.models, tier),
    tier,
    ...(reasoningEffort === undefined || reasoningEffort === "auto" ? {} : { reasoningEffort }),
    reason: "single provider tier selection",
  };
}

export function selectModelForPrompt(
  config: ModelConfig,
  prompt: string,
  requestedTier?: ModelTier,
  options: SelectModelOptions = {},
): SelectedModel {
  const [selected] = selectModelCandidatesForPrompt(config, prompt, requestedTier, options);
  if (selected !== undefined) {
    return selected;
  }
  switch (config.mode) {
    case "single":
      return selectSingleProviderModel(config.single, requestedTier);
    case "auto":
      return {
        ...selectSingleProviderModel(config.single, requestedTier, reasoningEffortForConfig(config)),
        reason: "auto routing fallback",
      };
    default:
      return assertNever(config.mode);
  }
}

export function selectModelCandidatesForPrompt(
  config: ModelConfig,
  prompt: string,
  requestedTier?: ModelTier,
  options: SelectModelOptions = {},
): readonly SelectedModel[] {
  switch (config.mode) {
    case "single":
      return [selectSingleProviderModel(config.single, requestedTier, reasoningEffortForConfig(config))];
    case "auto":
      return selectAutoCandidates(config, prompt, requestedTier, options)
        .map((candidate) => attachReasoningEffort(candidate, reasoningEffortForConfig(config)));
    default:
      return assertNever(config.mode);
  }
}

export function reasoningEffortForConfig(config: ModelConfig): ReasoningEffort {
  return config.reasoning?.effort ?? defaultReasoningConfig.effort;
}

export function describeModelMode(config: ModelConfig): string {
  switch (config.mode) {
    case "single":
      return `single provider: ${config.single.provider} (${config.single.defaultTier} default, low/mid/high tiers configured)`;
    case "auto":
      return `multi-provider auto routing: ${autoCategories(config).length} categories, ${autoAgentRoutes(config).length} agent route(s)`;
    default:
      return assertNever(config.mode);
  }
}

export function classifyPromptCategory(prompt: string, config?: ModelConfig): AutoModelCategory {
  return classifyPromptCategoryImpl(prompt, config);
}

export function autoCategories(config: ModelConfig): readonly AutoModelCategoryRoute[] {
  return autoCategoriesImpl(config);
}

export function autoAgentRoutes(config: ModelConfig): readonly AutoModelAgentRoute[] {
  return autoAgentRoutesImpl(config);
}

export function formatRoutePreview(config: ModelConfig, prompt: string, options: SelectModelOptions = {}): string {
  const candidates = selectModelCandidatesForPrompt({ ...config, mode: "auto" }, prompt, undefined, options);
  const [selected] = candidates;
  if (selected === undefined) {
    return "route: no candidate";
  }
  const skipped = selected.skipped === undefined || selected.skipped.length === 0
    ? ""
    : `\nskipped: ${selected.skipped.join(", ")}`;
  const fallbacks = candidates.slice(1, 4).map((candidate) => `${candidate.provider}/${candidate.model}`).join(" -> ");
  return [
    `route: ${selected.agent ?? selected.category ?? "legacy"} -> ${selected.provider}/${selected.model} (${selected.reason})`,
    fallbacks.length === 0 ? "" : `fallbacks: ${fallbacks}`,
    skipped,
  ].filter((line) => line.length > 0).join("\n");
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

function attachReasoningEffort(selected: SelectedModel, effort: ReasoningEffort): SelectedModel {
  return effort === "auto" ? selected : { ...selected, reasoningEffort: effort };
}

function assertNever(value: never): never {
  throw new Error(`Unexpected model routing variant: ${String(value)}`);
}
