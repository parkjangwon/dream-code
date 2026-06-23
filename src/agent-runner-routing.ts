import type { AgentDefinition } from "./agent-library.js";
import type { DreamConfig } from "./config.js";
import type { DreamCredentials } from "./credentials.js";
import type { ProviderEnv } from "./llm-provider.js";
import { selectModelForPrompt, type SelectedModel } from "./model-routing.js";
import { providerIsEnabled } from "./provider-settings.js";
import { listProviderDefinitions } from "./provider-registry.js";
import { providerConnectionSource } from "./tui-provider-status.js";

export function connectedProviderIds(
  config: DreamConfig,
  credentials: DreamCredentials,
  env: ProviderEnv,
): ReadonlySet<string> {
  return new Set(listProviderDefinitions()
    .filter((definition) => providerConnectionSource(definition, credentials.providers[definition.id], env) !== "missing")
    .filter((definition) => providerIsEnabled(config, definition.id))
    .map((definition) => definition.id));
}

export function firstSelectedModel(selectedModels: readonly SelectedModel[]): SelectedModel {
  const selected = selectedModels[0];
  if (selected !== undefined) {
    return selected;
  }
  return selectModelForPrompt({
    mode: "single",
    single: {
      provider: "openai",
      models: { low: "gpt-5.4-mini", mid: "gpt-5.5", high: "gpt-5.5" },
      defaultTier: "mid",
    },
    auto: { routes: [] },
  }, "fallback");
}

export function tierForAgent(agent: AgentDefinition | undefined): "low" | "mid" | "high" | undefined {
  switch (agent?.model) {
    case "low":
    case "mid":
    case "high":
      return agent.model;
    default:
      return undefined;
  }
}
