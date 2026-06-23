import type { DreamConfig } from "./config.js";
import { catalogModelsForProvider, type ModelCatalog } from "./model-catalog.js";
import { bestModelForTier, modelStrengthScore } from "./model-profile.js";
import { defaultAutoAgentRoutes, defaultAutoCategories } from "./model-routing-defaults.js";
import type { AutoModelAgentRoute, AutoModelCategoryRoute, ModelTier } from "./model-routing.js";
import { listProviderDefinitions, type ProviderDefinition } from "./provider-registry.js";

export function bootstrapAutoModelConfig(
  config: DreamConfig,
  connectedProviders: ReadonlySet<string>,
  catalog?: ModelCatalog,
): DreamConfig {
  const connectedDefinitions = listProviderDefinitions()
    .filter((definition) => connectedProviders.has(definition.id));
  if (connectedDefinitions.length === 0) {
    return config;
  }

  const nextAuto = {
    ...config.model.auto,
    categories: defaultAutoCategories().map((route) => bootstrapCategoryRoute(route, connectedDefinitions, catalog)),
    agentRoutes: defaultAutoAgentRoutes().map((route) => bootstrapAgentRoute(route, connectedDefinitions, catalog)),
  };

  return {
    ...config,
    model: {
      ...config.model,
      mode: "auto",
      auto: {
        ...nextAuto,
        preferConnectedProviders: true,
      },
    },
  };
}

function bootstrapCategoryRoute(
  route: AutoModelCategoryRoute,
  connectedDefinitions: readonly ProviderDefinition[],
  catalog: ModelCatalog | undefined,
): AutoModelCategoryRoute {
  return {
    ...route,
    candidates: [...routeCandidates(route.candidates, route.tier, connectedDefinitions, catalog)],
  };
}

function bootstrapAgentRoute(
  route: AutoModelAgentRoute,
  connectedDefinitions: readonly ProviderDefinition[],
  catalog: ModelCatalog | undefined,
): AutoModelAgentRoute {
  return {
    ...route,
    candidates: [...routeCandidates(route.candidates, route.tier, connectedDefinitions, catalog)],
  };
}

function routeCandidates(
  preferred: readonly string[],
  tier: ModelTier,
  connectedDefinitions: readonly ProviderDefinition[],
  catalog: ModelCatalog | undefined,
): readonly string[] {
  const connectedIds = new Set(connectedDefinitions.map((definition) => definition.id));
  const preferredConnected = preferred.filter((candidate) => {
    return connectedIds.has(providerFromCandidate(candidate)) && candidateExistsInCatalog(candidate, catalog);
  });
  const tierDefaults = connectedDefinitions.map((definition) => `${definition.id}/${modelForDefinitionTier(definition, tier, catalog)}`);
  const candidates = unique([...preferredConnected, ...tierDefaults]);
  return tier === "high" ? [...candidates].sort((left, right) => modelStrengthScore(right) - modelStrengthScore(left)) : candidates;
}

function providerFromCandidate(candidate: string): string {
  return candidate.slice(0, Math.max(0, candidate.indexOf("/")));
}

function modelFromCandidate(candidate: string): string {
  const separator = candidate.indexOf("/");
  return separator < 0 ? candidate : candidate.slice(separator + 1);
}

function candidateExistsInCatalog(candidate: string, catalog: ModelCatalog | undefined): boolean {
  const provider = providerFromCandidate(candidate);
  const models = catalogModelsForProvider(catalog, provider);
  return models.length === 0 || models.includes(modelFromCandidate(candidate));
}

function modelForDefinitionTier(
  definition: ProviderDefinition,
  tier: ModelTier,
  catalog: ModelCatalog | undefined,
): string {
  const models = catalogModelsForProvider(catalog, definition.id);
  const defaultModel = modelForTier(definition.defaultModels, tier);
  if (models.length === 0 || models.includes(defaultModel)) {
    return defaultModel;
  }
  return bestModelForTier(models, tier) ?? models[0] ?? defaultModel;
}

function modelForTier(
  models: ProviderDefinition["defaultModels"],
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

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function assertNever(value: never): never {
  throw new Error(`Unexpected model tier: ${String(value)}`);
}
