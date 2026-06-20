import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import { saveConfig, type DreamConfig } from "./config.js";
import { loadCredentials } from "./credentials.js";
import type { ProviderEnv } from "./llm-provider.js";
import {
  autoCategories,
  describeModelMode,
  formatRoutePreview,
  modelTierSchema,
  type ModelTier,
} from "./model-routing.js";
import {
  listProviderDefinitions,
  providerModelIdForRequest,
  resolveProviderDefinition,
  type ProviderDefinition,
  type ProviderTierModels,
} from "./provider-registry.js";
import type { ProviderQuestioner } from "./tui-provider-picker.js";
import { providerConnectionSource } from "./tui-provider-status.js";

export type ConfigureModelsOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly args: string;
  readonly questioner: ProviderQuestioner;
};

type ModelSelection =
  | { readonly kind: "set-tier"; readonly tier: ModelTier }
  | { readonly kind: "set-model"; readonly tier: ModelTier; readonly model: string }
  | { readonly kind: "unchanged" };

export async function configureModels(options: ConfigureModelsOptions): Promise<DreamConfig> {
  const modeCommand = await maybeHandleModelModeCommand(options);
  if (modeCommand !== undefined) {
    return modeCommand;
  }

  const definition = resolveProviderDefinition(options.config.model.single.provider);
  if (definition === undefined) {
    output.write(`unknown provider: ${options.config.model.single.provider}\n`);
    return options.config;
  }

  const selection = await resolveModelSelection(options, definition);
  if (selection.kind === "unchanged") {
    return options.config;
  }

  const nextConfig = configWithModelSelection(options.config, selection);
  await saveConfig(options.configRoot, nextConfig);
  output.write(formatSelectedModel(nextConfig));
  return nextConfig;
}

async function maybeHandleModelModeCommand(options: ConfigureModelsOptions): Promise<DreamConfig | undefined> {
  const args = options.args.trim();
  if (args === "auto") {
    const nextConfig = { ...options.config, model: { ...options.config.model, mode: "auto" as const } };
    await saveConfig(options.configRoot, nextConfig);
    output.write(`${paint("model routing:", ansi.green)} ${describeModelMode(nextConfig.model)}\n`);
    return nextConfig;
  }
  if (args === "single") {
    const nextConfig = { ...options.config, model: { ...options.config.model, mode: "single" as const } };
    await saveConfig(options.configRoot, nextConfig);
    output.write(`${paint("model routing:", ansi.green)} ${describeModelMode(nextConfig.model)}\n`);
    return nextConfig;
  }
  if (args === "routes") {
    output.write(formatAutoRoutes(options.config));
    return options.config;
  }
  if (args.startsWith("route ")) {
    output.write(`${formatRoutePreview(options.config.model, args.slice("route ".length).trim(), {
      connectedProviders: await connectedProviderIds(options.configRoot, process.env),
    })}\n`);
    return options.config;
  }
  return undefined;
}

function resolveModelSelection(
  options: ConfigureModelsOptions,
  definition: ProviderDefinition,
): Promise<ModelSelection> {
  const args = options.args.trim();
  if (args.length > 0) {
    if (args === "list") {
      output.write(formatModelMenu(options.config, definition));
      return Promise.resolve({ kind: "unchanged" });
    }
    return Promise.resolve(parseModelSelection(args, definition.id, options.config.model.single.defaultTier));
  }

  return promptModelSelection(options.config, definition, options.questioner);
}

async function promptModelSelection(
  config: DreamConfig,
  definition: ProviderDefinition,
  questioner: ProviderQuestioner,
): Promise<ModelSelection> {
  if (questioner.select !== undefined) {
    const selected = await questioner.select({
      title: `Models ${definition.displayName}`,
      choices: modelChoices(definition, config.model.single.models),
      initialValue: modelForTier(config.model.single.models, config.model.single.defaultTier),
    });
    return selected === undefined
      ? { kind: "unchanged" }
      : { kind: "set-model", tier: config.model.single.defaultTier, model: selected };
  }

  output.write(formatModelMenu(config, definition));
  const answer = await questioner.question("Model: ");
  if (answer.trim().length === 0) {
    output.write("model unchanged\n");
    return { kind: "unchanged" };
  }
  if (isCustomAnswer(answer)) {
    const tier = parseTier(await questioner.question("Tier [low/mid/high]: "));
    if (tier === undefined) {
      output.write("model unchanged\n");
      return { kind: "unchanged" };
    }
    const model = providerModelIdForRequest(definition.id, await questioner.question("Model id: "));
    return model.trim().length > 0 ? { kind: "set-model", tier, model } : { kind: "unchanged" };
  }
  return parseModelSelection(answer, definition.id, config.model.single.defaultTier);
}

function parseModelSelection(
  text: string,
  provider: string,
  activeTier: ModelTier,
): ModelSelection {
  const parts = text.trim().split(/\s+/u).filter((part) => part.length > 0);
  const [tierInput, ...modelParts] = parts;
  if (tierInput === undefined || tierInput === "list") {
    return { kind: "unchanged" };
  }

  const tier = parseTier(tierInput);
  if (tier === undefined) {
    return { kind: "set-model", tier: activeTier, model: providerModelIdForRequest(provider, text) };
  }

  const rawModel = modelParts.join(" ").trim();
  if (rawModel.length === 0) {
    return { kind: "set-tier", tier };
  }
  return { kind: "set-model", tier, model: providerModelIdForRequest(provider, rawModel) };
}

function configWithModelSelection(config: DreamConfig, selection: ModelSelection): DreamConfig {
  switch (selection.kind) {
    case "set-tier":
      return {
        ...config,
        model: {
          ...config.model,
          mode: "single",
          single: { ...config.model.single, defaultTier: selection.tier },
        },
      };
    case "set-model":
      return {
        ...config,
        model: {
          ...config.model,
          mode: "single",
          single: {
            ...config.model.single,
            defaultTier: selection.tier,
            models: modelSet(config.model.single.models, selection.tier, selection.model),
          },
        },
      };
    case "unchanged":
      return config;
    default:
      return assertNever(selection);
  }
}

function modelSet(
  models: ProviderTierModels,
  tier: ModelTier,
  model: string,
): ProviderTierModels {
  switch (tier) {
    case "low":
      return { ...models, low: model };
    case "mid":
      return { ...models, mid: model };
    case "high":
      return { ...models, high: model };
    default:
      return assertNever(tier);
  }
}

function formatModelMenu(config: DreamConfig, definition: ProviderDefinition): string {
  const currentTier = config.model.single.defaultTier;
  const models = config.model.single.models;
  const lines = [
    `${paint("Models", ansi.accent)} ${definition.displayName}`,
    `${paint("mode", ansi.dim)} ${describeModelMode(config.model)}`,
  ];
  for (const model of definition.availableModels) {
    lines.push(formatModelLine(model, models, currentTier));
  }
  lines.push("Type a model id, low, mid, high, auto, single, routes, or custom.", "");
  return lines.join("\n");
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

function modelChoices(definition: ProviderDefinition, models: ProviderTierModels) {
  return definition.availableModels.map((model) => ({
    value: model,
    label: model,
    description: tierForModel(models, model) ?? "",
    keywords: [definition.displayName, definition.id],
  }));
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

function formatSelectedModel(config: DreamConfig): string {
  const tier = config.model.single.defaultTier;
  return `model set: ${config.model.single.provider} ${modelForTier(config.model.single.models, tier)} (${formatTier(tier)})\n`;
}

function formatAutoRoutes(config: DreamConfig): string {
  return [
    `${paint("Multi-Model Routing", `${ansi.bold}${ansi.accent}`)} ${paint(config.model.mode, ansi.dim)}`,
    ...autoCategories(config.model).map((route) => {
      return `${paint(route.id.padEnd(11), ansi.blue)} ${route.tier.padEnd(4)} ${route.candidates.join(" -> ")}`;
    }),
    "",
  ].join("\n");
}

async function connectedProviderIds(root: string, env: ProviderEnv): Promise<ReadonlySet<string>> {
  const credentials = await loadCredentials(root);
  return new Set(listProviderDefinitions()
    .filter((definition) => providerConnectionSource(definition, credentials.providers[definition.id], env) !== "missing")
    .map((definition) => definition.id));
}

function modelForTier(models: ProviderTierModels, tier: ModelTier): string {
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

function parseTier(input: string): ModelTier | undefined {
  const normalized = input.trim().toLowerCase();
  if (normalized === "1") {
    return "low";
  }
  if (normalized === "2") {
    return "mid";
  }
  if (normalized === "3") {
    return "high";
  }
  const parsed = modelTierSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

function isCustomAnswer(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return normalized === "c" || normalized === "custom";
}

function formatTier(tier: ModelTier): string {
  return `${tier[0]?.toUpperCase() ?? ""}${tier.slice(1)}`;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected model selection variant: ${String(value)}`);
}
