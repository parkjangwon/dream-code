import type { DreamConfig } from "./config.js";
import { catalogModelsForProvider, loadModelCatalog } from "./model-catalog.js";
import { refreshModelCatalogForProviders } from "./model-discovery.js";
import type { ProviderDefinition } from "./provider-registry.js";
import { connectedProviderIds } from "./tui-auto-routing-command.js";

export async function modelsForProviderMenu(
  root: string,
  config: DreamConfig,
  definition: ProviderDefinition,
): Promise<readonly string[]> {
  const connectedProviders = await connectedProviderIds(root, process.env);
  const catalog = connectedProviders.has(definition.id)
    ? (await refreshModelCatalogForProviders(root, new Set([definition.id]), process.env)).catalog
    : await loadModelCatalog(root);
  const catalogModels = catalogModelsForProvider(catalog, definition.id);
  const sourceModels = catalogModels.length > 0 ? catalogModels : definition.availableModels;
  return uniqueModels([
    ...sourceModels,
    config.model.single.models.low,
    config.model.single.models.mid,
    config.model.single.models.high,
  ]);
}

function uniqueModels(models: readonly string[]): readonly string[] {
  return [...new Set(models.filter((model) => model.trim().length > 0))];
}
