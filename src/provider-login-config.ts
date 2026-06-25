import type { DreamConfig } from "./config.js";
import type { ProviderEnv } from "./llm-provider.js";
import { refreshModelCatalogForProviders } from "./model-discovery.js";
import { tierModelsForProviderCatalog } from "./provider-model-defaults.js";
import type { ProviderDefinition } from "./provider-registry.js";

export async function configWithConnectedProvider(
  configRoot: string,
  config: DreamConfig,
  definition: ProviderDefinition,
  env: ProviderEnv,
): Promise<DreamConfig> {
  if (definition.id !== "custom-openai") {
    return configWithProvider(config, definition, definition.defaultModels);
  }
  const refresh = await refreshModelCatalogForProviders(
    configRoot,
    new Set([definition.id]),
    env,
    { force: true },
  );
  return configWithProvider(
    config,
    definition,
    tierModelsForProviderCatalog(definition, refresh.catalog),
  );
}

function configWithProvider(
  config: DreamConfig,
  definition: ProviderDefinition,
  models: ProviderDefinition["defaultModels"],
): DreamConfig {
  return {
    ...config,
    providers: {
      ...config.providers,
      [definition.id]: { enabled: true },
    },
    model: {
      ...config.model,
      mode: "single",
      single: {
        provider: definition.id,
        models,
        defaultTier: "mid",
      },
    },
  };
}
