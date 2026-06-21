import type { DreamConfig } from "./config.js";
import { defaultAutoAgentRoutes, defaultAutoCategories } from "./model-routing-defaults.js";
import type { AutoModelAgentRoute, AutoModelCategoryRoute, ModelTier } from "./model-routing.js";
import { listProviderDefinitions, type ProviderDefinition } from "./provider-registry.js";

export function bootstrapAutoModelConfig(
  config: DreamConfig,
  connectedProviders: ReadonlySet<string>,
): DreamConfig {
  const connectedDefinitions = listProviderDefinitions()
    .filter((definition) => connectedProviders.has(definition.id));
  const nextAuto = connectedDefinitions.length === 0
    ? {
      ...config.model.auto,
      categories: [...defaultAutoCategories()],
      agentRoutes: [...defaultAutoAgentRoutes()],
    }
    : {
      ...config.model.auto,
      categories: defaultAutoCategories().map((route) => bootstrapCategoryRoute(route, connectedDefinitions)),
      agentRoutes: defaultAutoAgentRoutes().map((route) => bootstrapAgentRoute(route, connectedDefinitions)),
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
): AutoModelCategoryRoute {
  return {
    ...route,
    candidates: [...routeCandidates(route.candidates, route.tier, connectedDefinitions)],
  };
}

function bootstrapAgentRoute(
  route: AutoModelAgentRoute,
  connectedDefinitions: readonly ProviderDefinition[],
): AutoModelAgentRoute {
  return {
    ...route,
    candidates: [...routeCandidates(route.candidates, route.tier, connectedDefinitions)],
  };
}

function routeCandidates(
  preferred: readonly string[],
  tier: ModelTier,
  connectedDefinitions: readonly ProviderDefinition[],
): readonly string[] {
  const connectedIds = new Set(connectedDefinitions.map((definition) => definition.id));
  const preferredConnected = preferred.filter((candidate) => connectedIds.has(providerFromCandidate(candidate)));
  const tierDefaults = connectedDefinitions.map((definition) => `${definition.id}/${modelForTier(definition.defaultModels, tier)}`);
  return unique([...preferredConnected, ...tierDefaults]);
}

function providerFromCandidate(candidate: string): string {
  return candidate.slice(0, Math.max(0, candidate.indexOf("/")));
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
