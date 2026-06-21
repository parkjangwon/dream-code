import { request } from "undici";
import { z } from "zod";

import {
  loadModelCatalog,
  saveModelCatalog,
  upsertCatalogProvider,
  type ModelCatalog,
} from "./model-catalog.js";
import { readProviderCredential } from "./credentials.js";
import type { ProviderEnv } from "./llm-provider.js";
import {
  buildProviderRequestHeaders,
  ProviderProtocolError,
  resolveProviderSettingsForRequest,
} from "./llm-provider.js";
import { listProviderDefinitions, type ProviderDefinition } from "./provider-registry.js";

export type ModelCatalogRefreshResult = {
  readonly catalog: ModelCatalog;
  readonly liveProviders: number;
  readonly fallbackProviders: number;
};

const modelListSchema = z.object({
  data: z.array(z.union([
    z.string(),
    z.object({ id: z.string().min(1) }),
  ])).optional(),
  models: z.array(z.union([
    z.string(),
    z.object({ id: z.string().min(1) }),
    z.object({ name: z.string().min(1) }),
  ])).optional(),
});

const catalogTtlMs = 24 * 60 * 60 * 1000;

export async function refreshModelCatalogForProviders(
  root: string,
  connectedProviders: ReadonlySet<string>,
  env: ProviderEnv,
): Promise<ModelCatalogRefreshResult> {
  const catalog = await loadModelCatalog(root);
  const definitions = listProviderDefinitions()
    .filter((definition) => connectedProviders.has(definition.id));
  const entries = await Promise.all(definitions.map((definition) => catalogEntryForProvider(root, definition, catalog, env)));
  const nextCatalog = entries.reduce((current, entry) => upsertCatalogProvider(current, entry.provider), catalog);
  await saveModelCatalog(root, nextCatalog);
  return {
    catalog: nextCatalog,
    liveProviders: entries.filter((entry) => entry.live).length,
    fallbackProviders: entries.filter((entry) => !entry.live).length,
  };
}

async function catalogEntryForProvider(
  root: string,
  definition: ProviderDefinition,
  catalog: ModelCatalog,
  env: ProviderEnv,
): Promise<{ readonly live: boolean; readonly provider: ModelCatalog["providers"][string] }> {
  const cached = catalog.providers[definition.id];
  if (cached !== undefined && catalogEntryIsFresh(cached)) {
    return { live: false, provider: cached };
  }

  try {
    const models = await discoverProviderModels(root, definition, env);
    return {
      live: true,
      provider: {
        provider: definition.id,
        fetchedAt: new Date().toISOString(),
        source: "live",
        models,
      },
    };
  } catch (error) {
    if (error instanceof ProviderProtocolError || error instanceof Error) {
      return {
        live: false,
        provider: cached ?? {
          provider: definition.id,
          fetchedAt: new Date().toISOString(),
          source: "registry",
          models: definition.availableModels,
        },
      };
    }
    throw error;
  }
}

function catalogEntryIsFresh(entry: ModelCatalog["providers"][string]): boolean {
  const fetchedAt = Date.parse(entry.fetchedAt);
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < catalogTtlMs;
}

async function discoverProviderModels(
  root: string,
  definition: ProviderDefinition,
  env: ProviderEnv,
): Promise<readonly string[]> {
  const credential = await readProviderCredential(definition.id, root);
  const settings = await resolveProviderSettingsForRequest(definition.id, env, credential);
  const response = await request(`${settings.baseUrl}/models`, {
    method: "GET",
    headers: buildProviderRequestHeaders(settings),
    headersTimeout: 5_000,
    bodyTimeout: 8_000,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ProviderProtocolError(`model discovery failed for ${definition.id}: HTTP ${response.statusCode}`);
  }
  return parseModelList(await response.body.text());
}

export function parseModelList(raw: string): readonly string[] {
  const parsed = modelListSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return [];
  }
  const values = parsed.data.data ?? parsed.data.models ?? [];
  return unique(values.flatMap(modelIdFromListItem));
}

function modelIdFromListItem(item: string | { readonly id: string } | { readonly name: string }): readonly string[] {
  if (typeof item === "string") {
    return [item];
  }
  if ("id" in item) {
    return [item.id];
  }
  return [item.name];
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
