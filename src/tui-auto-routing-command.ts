import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import { saveConfig, type DreamConfig } from "./config.js";
import { loadCredentials } from "./credentials.js";
import type { ProviderEnv } from "./llm-provider.js";
import { bootstrapAutoModelConfig } from "./model-auto-bootstrap.js";
import { autoAgentRoutes, autoCategories, describeModelMode } from "./model-routing.js";
import { listProviderDefinitions } from "./provider-registry.js";
import { providerConnectionSource } from "./tui-provider-status.js";

export type EnableAutoRoutingOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
};

export async function enableAutoRouting(options: EnableAutoRoutingOptions): Promise<DreamConfig> {
  const connectedProviders = await connectedProviderIds(options.configRoot, process.env);
  if (connectedProviders.size === 0) {
    output.write(formatAutoNeedsLogin());
    return options.config;
  }
  const nextConfig = bootstrapAutoModelConfig(options.config, connectedProviders);
  await saveConfig(options.configRoot, nextConfig);
  output.write(formatAutoEnabled(nextConfig, connectedProviders.size));
  return nextConfig;
}

export function formatAutoRoutes(config: DreamConfig): string {
  return [
    `${paint("Multi-Model Routing", `${ansi.bold}${ansi.accent}`)} ${paint(config.model.mode, ansi.dim)}`,
    ...autoCategories(config.model).map((route) => {
      return `${paint(route.id.padEnd(11), ansi.blue)} ${route.tier.padEnd(4)} ${route.candidates.join(" -> ")}`;
    }),
    "",
    `${paint("Agent Routes", `${ansi.bold}${ansi.accent}`)}`,
    ...autoAgentRoutes(config.model).map((route) => {
      return `${paint(route.agent.padEnd(18), ansi.blue)} ${route.tier.padEnd(4)} ${route.candidates.join(" -> ")}`;
    }),
    "",
  ].join("\n");
}

export async function connectedProviderIds(root: string, env: ProviderEnv): Promise<ReadonlySet<string>> {
  const credentials = await loadCredentials(root);
  return new Set(listProviderDefinitions()
    .filter((definition) => providerConnectionSource(definition, credentials.providers[definition.id], env) !== "missing")
    .map((definition) => definition.id));
}

function formatAutoEnabled(config: DreamConfig, connectedProviderCount: number): string {
  return [
    `${paint("auto mode:", ansi.green)} ${describeModelMode(config.model)}`,
    `${paint("providers", ansi.dim)} ${connectedProviderCount} connected · ${paint("strategy", ansi.dim)} models.toml`,
    "",
  ].filter((line) => line.length > 0).join("\n");
}

function formatAutoNeedsLogin(): string {
  return [
    `${paint("auto mode:", ansi.yellow)} needs at least one connected provider`,
    `${paint("next", ansi.dim)} run ${paint("/login", ansi.blue)} to connect OpenAI, DeepSeek, Gemini, or another provider.`,
    `${paint("why", ansi.dim)} Dream Code builds auto routes only from models you can actually use.`,
    "",
  ].join("\n");
}
