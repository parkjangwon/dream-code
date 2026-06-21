import { stdout as output } from "node:process";

import { saveConfig, type DreamConfig } from "./config.js";
import { loadCredentials, type ProviderCredential } from "./credentials.js";
import type { ProviderEnv } from "./llm-provider.js";
import { providerIsEnabled, setProviderEnabled } from "./provider-settings.js";
import {
  listProviderDefinitions,
  resolveProviderDefinition,
  type ProviderDefinition,
} from "./provider-registry.js";
import type { ProviderQuestioner } from "./tui-provider-picker.js";
import {
  isProviderConnected,
  providerConnectionSource,
} from "./tui-provider-status.js";

export type SwitchProviderOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly args: string;
  readonly questioner: ProviderQuestioner;
  readonly env?: ProviderEnv;
};

export async function switchProvider(options: SwitchProviderOptions): Promise<DreamConfig> {
  const env = options.env ?? process.env;
  const credentials = await loadCredentials(options.configRoot);
  const args = options.args.trim();
  if (args === "list") {
    return options.config;
  }
  const toggled = await maybeToggleProvider(options);
  if (toggled !== undefined) {
    return toggled;
  }
  if (args.length === 0 && options.questioner.manageProviders !== undefined) {
    return await promptProviderManager(options, credentials.providers, env);
  }

  const definition = args.length === 0
    ? await promptConnectedProvider(options.questioner, credentials.providers, env, options.config)
    : resolveProviderDefinition(args);
  if (definition === undefined) {
    output.write(args.length === 0 ? "provider unchanged\n" : `unknown provider: ${args}\n`);
    return options.config;
  }

  const credential = credentials.providers[definition.id];
  if (!isProviderConnected(definition, credential, env, options.config)) {
    output.write(`${definition.displayName} is not connected. Use /login ${definition.id} first.\n`);
    return options.config;
  }

  const nextConfig = configWithProvider(options.config, definition);
  await saveConfig(options.configRoot, nextConfig);
  output.write(`provider set: ${definition.id} (${definition.defaultModels.mid})\n`);
  return nextConfig;
}

async function promptConnectedProvider(
  questioner: ProviderQuestioner,
  providers: Readonly<Record<string, ProviderCredential>>,
  env: ProviderEnv,
  config?: DreamConfig,
): Promise<ProviderDefinition | undefined> {
  const definitions = listProviderDefinitions()
    .filter((definition) => isProviderConnected(definition, providers[definition.id], env, config));
  if (definitions.length === 0) {
    output.write("no connected providers. Use /login first.\n");
    return undefined;
  }

  if (questioner.select !== undefined) {
    const pickerOptions = {
      title: "Providers",
      choices: definitions.map((definition) => ({
        value: definition.id,
        label: definition.displayName,
        description: `${definition.id} ${providerConnectionSource(definition, providers[definition.id], env)}`,
        keywords: [definition.id, definition.displayName, ...definition.envKeys],
      })),
    };
    const firstDefinition = definitions[0];
    const selected = await questioner.select(firstDefinition === undefined
      ? pickerOptions
      : { ...pickerOptions, initialValue: firstDefinition.id });
    return selected === undefined ? undefined : resolveProviderDefinition(selected);
  }

  output.write(`Providers\n${definitions.map((definition) => providerMenuLine(definition)).join("")}`);
  const answer = await questioner.question("Provider: ");
  return answer.trim().length === 0 ? undefined : resolveProviderDefinition(answer);
}

async function promptProviderManager(
  options: SwitchProviderOptions,
  providers: Readonly<Record<string, ProviderCredential>>,
  env: ProviderEnv,
): Promise<DreamConfig> {
  const result = await options.questioner.manageProviders?.({
    providers: listProviderDefinitions().map((definition) => ({
      id: definition.id,
      displayName: definition.displayName,
      source: providerConnectionSource(definition, providers[definition.id], env),
      enabled: providerIsEnabled(options.config, definition.id),
      active: options.config.model.single.provider === definition.id,
      regions: definition.regions.map((region) => region.id).join("/"),
    })),
    disabled: disabledProviderIds(options.config),
  });
  if (result === undefined) {
    output.write("provider unchanged\n");
    return options.config;
  }

  const availabilityConfig = configWithProviderAvailability(options.config, result.disabled);
  const definition = result.selectedProviderId === undefined
    ? undefined
    : resolveProviderDefinition(result.selectedProviderId);
  if (definition === undefined || !providerIsEnabled(availabilityConfig, definition.id)) {
    await saveConfig(options.configRoot, availabilityConfig);
    output.write("providers saved\n");
    return availabilityConfig;
  }
  if (!isProviderConnected(definition, providers[definition.id], env, availabilityConfig)) {
    await saveConfig(options.configRoot, availabilityConfig);
    output.write("providers saved\n");
    return availabilityConfig;
  }

  const nextConfig = configWithProvider(availabilityConfig, definition);
  await saveConfig(options.configRoot, nextConfig);
  output.write(`provider set: ${definition.id} (${definition.defaultModels.mid})\n`);
  return nextConfig;
}

async function maybeToggleProvider(options: SwitchProviderOptions): Promise<DreamConfig | undefined> {
  const [action, provider] = options.args.trim().split(/\s+/u);
  if (action !== "enable" && action !== "disable") {
    return undefined;
  }
  if (provider === undefined) {
    output.write(`usage: /provider ${action} <provider>\n`);
    return options.config;
  }
  const definition = resolveProviderDefinition(provider);
  if (definition === undefined) {
    output.write(`unknown provider: ${provider}\n`);
    return options.config;
  }
  const enabled = action === "enable";
  const nextConfig = await setProviderEnabled(options.configRoot, options.config, definition.id, enabled);
  output.write(`provider ${enabled ? "enabled" : "disabled"}: ${definition.id}\n`);
  if (!enabled && providerIsEnabled(options.config, definition.id) && options.config.model.single.provider === definition.id) {
    output.write("current single provider is disabled; choose another provider before sending prompts.\n");
  }
  return nextConfig;
}

function providerMenuLine(definition: ProviderDefinition): string {
  return `${definition.id.padEnd(16)} ${definition.displayName}\n`;
}

function disabledProviderIds(config: DreamConfig): readonly string[] {
  return Object.entries(config.providers)
    .filter(([, setting]) => setting.enabled === false)
    .map(([provider]) => provider)
    .sort();
}

function configWithProviderAvailability(config: DreamConfig, disabled: readonly string[]): DreamConfig {
  const disabledSet = new Set(disabled);
  const providers = { ...config.providers };
  for (const definition of listProviderDefinitions()) {
    if (disabledSet.has(definition.id)) {
      providers[definition.id] = { enabled: false };
    } else if (providers[definition.id]?.enabled === false) {
      providers[definition.id] = { enabled: true };
    }
  }
  return { ...config, providers };
}

function configWithProvider(config: DreamConfig, definition: ProviderDefinition): DreamConfig {
  return {
    ...config,
    model: {
      ...config.model,
      mode: "single",
      single: {
        provider: definition.id,
        models: { ...definition.defaultModels },
        defaultTier: "mid",
      },
    },
  };
}
