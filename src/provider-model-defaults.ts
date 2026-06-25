import { catalogModelsForProvider, type ModelCatalog } from "./model-catalog.js";
import { bestModelForTier } from "./model-profile.js";
import type { ProviderDefinition, ProviderTierModels } from "./provider-registry.js";

export function tierModelsForProviderCatalog(
  definition: ProviderDefinition,
  catalog: ModelCatalog,
): ProviderTierModels {
  return tierModelsFromModelIds(definition, catalogModelsForProvider(catalog, definition.id));
}

export function tierModelsFromModelIds(
  definition: ProviderDefinition,
  modelIds: readonly string[],
): ProviderTierModels {
  const models = modelIds
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
  const [firstModel] = models;
  if (firstModel === undefined) {
    return { ...definition.defaultModels };
  }

  const mid = bestModelForTier(models, "mid") ?? firstModel;
  return {
    low: bestModelForTier(models, "low") ?? mid,
    mid,
    high: bestModelForTier(models, "high") ?? mid,
  };
}
