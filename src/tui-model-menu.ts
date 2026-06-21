import { ansi, paint } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { describeModelMode, type ModelTier } from "./model-routing.js";
import type { ProviderDefinition, ProviderTierModels } from "./provider-registry.js";

export function formatModelMenu(
  config: DreamConfig,
  definition: ProviderDefinition,
  availableModels: readonly string[],
): string {
  const currentTier = config.model.single.defaultTier;
  const models = config.model.single.models;
  const lines = [
    `${paint("Models", ansi.accent)} ${definition.displayName}`,
    `${paint("mode", ansi.dim)} ${describeModelMode(config.model)}`,
  ];
  for (const model of availableModels) {
    lines.push(formatModelLine(model, models, currentTier));
  }
  lines.push("Type a model id, low, mid, high, auto, single, routes, or custom.", "");
  return lines.join("\n");
}

export function modelChoices(
  definition: ProviderDefinition,
  models: ProviderTierModels,
  availableModels: readonly string[],
) {
  return availableModels.map((model) => ({
    value: model,
    label: model,
    description: tierForModel(models, model) ?? "",
    keywords: [definition.displayName, definition.id],
  }));
}

function formatModelLine(
  model: string,
  models: ProviderTierModels,
  currentTier: ModelTier,
): string {
  const tier = tierForModel(models, model);
  const selected = tier === currentTier ? ">" : " ";
  const suffix = tier === undefined ? "" : ` ${paint(`(${tier})`, ansi.dim)}`;
  return `${selected} ${model}${suffix}`;
}

function tierForModel(models: ProviderTierModels, model: string): ModelTier | undefined {
  if (models.low === model) {
    return "low";
  }
  if (models.mid === model) {
    return "mid";
  }
  if (models.high === model) {
    return "high";
  }
  return undefined;
}
