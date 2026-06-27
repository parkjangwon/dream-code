import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

import { loadConfig, saveConfig, type DreamConfig } from "./config.js";
import { loadCredentials } from "./credentials.js";
import { sendJson, readJson } from "./remote-http.js";
import { modelTierSchema, type ModelTier } from "./model-routing.js";
import { providerIsEnabled } from "./provider-settings.js";
import { listProviderDefinitions, resolveProviderDefinition } from "./provider-registry.js";
import { providerConnectionSource } from "./tui-provider-status.js";

const remoteModelUpdateSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  tier: modelTierSchema.optional(),
});

export async function handleRemoteModelResource(
  root: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method === "GET") {
    sendJson(response, 200, await remoteModelState(root));
    return;
  }
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }
  const parsed = remoteModelUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    sendJson(response, 400, { error: "Provider, model, and optional tier are required." });
    return;
  }
  const definition = resolveProviderDefinition(parsed.data.provider);
  if (definition === undefined) {
    sendJson(response, 400, { error: "Unknown provider." });
    return;
  }
  if (!definition.availableModels.includes(parsed.data.model)) {
    sendJson(response, 400, { error: "Model is not listed for this provider." });
    return;
  }
  const config = await loadConfig(root);
  const nextConfig = configWithSingleModel(config, definition.id, parsed.data.model, parsed.data.tier ?? config.model.single.defaultTier);
  await saveConfig(root, nextConfig);
  sendJson(response, 200, await remoteModelState(root));
}

async function remoteModelState(root: string) {
  const config = await loadConfig(root);
  const credentials = await loadCredentials(root);
  const providers = listProviderDefinitions().map((definition) => ({
    id: definition.id,
    name: definition.displayName,
    enabled: providerIsEnabled(config, definition.id),
    source: providerConnectionSource(definition, credentials.providers[definition.id], process.env),
    models: definition.availableModels,
  }));
  const defaultTier = config.model.single.defaultTier;
  return {
    mode: config.model.mode,
    single: {
      provider: config.model.single.provider,
      defaultTier,
      model: modelForTier(config, defaultTier),
      models: config.model.single.models,
    },
    providers,
  };
}

function configWithSingleModel(config: DreamConfig, provider: string, model: string, tier: ModelTier): DreamConfig {
  return {
    ...config,
    model: {
      ...config.model,
      mode: "single",
      single: {
        provider,
        defaultTier: tier,
        models: {
          low: model,
          mid: model,
          high: model,
        },
      },
    },
  };
}

function modelForTier(config: DreamConfig, tier: ModelTier): string {
  switch (tier) {
    case "low":
      return config.model.single.models.low;
    case "mid":
      return config.model.single.models.mid;
    case "high":
      return config.model.single.models.high;
    default:
      return assertNever(tier);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected model tier: ${String(value)}`);
}
