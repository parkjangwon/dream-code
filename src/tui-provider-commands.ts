import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import { type DreamConfig, saveConfig } from "./config.js";
import {
  loadCredentials,
  writeProviderCredential,
  type ProviderCredential,
} from "./credentials.js";
import type { ProviderEnv } from "./llm-provider.js";
import {
  apiKeyEnvKeys,
  baseUrlEnvKeys,
  listProviderDefinitions,
  regionForProvider,
  resolveProviderDefinition,
  type ProviderDefinition,
  type ProviderRegion,
} from "./provider-registry.js";
import {
  loginChoices,
  regionPrompt,
  resolveRegionInput,
  shouldPromptRegion,
} from "./tui-login-menu.js";
import { connectOpenAiOauth } from "./tui-openai-oauth.js";
import { promptProvider, type ProviderQuestioner } from "./tui-provider-picker.js";
import { formatProviderLine, savedProviderIds } from "./tui-provider-status.js";

export type LoginProviderOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly args: string;
  readonly questioner: ProviderQuestioner;
  readonly env?: ProviderEnv;
};

export async function printProviders(
  configRoot: string,
  env: ProviderEnv = process.env,
): Promise<void> {
  const credentials = await loadCredentials(configRoot);
  output.write(`${paint("Providers", ansi.accent)}\n`);
  for (const definition of listProviderDefinitions()) {
    output.write(formatProviderLine(definition, credentials.providers[definition.id], env));
  }
}

export async function loginProvider(options: LoginProviderOptions): Promise<DreamConfig> {
  const parts = options.args.trim().split(/\s+/u).filter((part) => part.length > 0);
  const env = options.env ?? process.env;
  const credentials = await loadCredentials(options.configRoot);
  const choices = loginChoices(savedProviderIds(credentials.providers), env);
  const providerArg = parts[0];
  const definition = providerArg === undefined
    ? await promptProvider(options.questioner, choices)
    : resolveProviderDefinition(providerArg);
  if (definition === undefined) {
    output.write(providerArg === undefined ? "login cancelled\n" : `unknown provider: ${providerArg}\n`);
    return options.config;
  }

  const optionParts = parts.slice(1);
  if (optionParts.includes("oauth")) {
    return connectOauth(definition, options);
  }

  const regionArg = optionParts.find((part) => part !== "api-key");
  const region = await resolveLoginRegion(definition, regionArg, options.questioner);
  if (region === undefined) {
    output.write(`unknown region for ${definition.id}: ${regionArg ?? ""}\n`);
    output.write(`regions: ${definition.regions.map((candidate) => candidate.id).join(", ")}\n`);
    return options.config;
  }

  const envKey = firstEnvKey(env, apiKeyEnvKeys(definition));
  const baseUrl = await resolveBaseUrl(definition, region, options.questioner, env);
  if (baseUrl === undefined) {
    output.write("connection cancelled: missing base URL\n");
    return options.config;
  }
  const credential = await credentialForConnection(region.id, baseUrl, envKey, options.questioner);
  if (credential === undefined) {
    output.write("connection cancelled: missing API key\n");
    return options.config;
  }
  await writeProviderCredential(options.configRoot, definition.id, credential);

  const nextConfig = configWithProvider(options.config, definition);
  await saveConfig(options.configRoot, nextConfig);
  output.write(`connected ${definition.displayName} (${region.label})\n`);
  return nextConfig;
}

export async function connectProvider(options: LoginProviderOptions): Promise<DreamConfig> {
  output.write("Use /login next time. /connect is an alias.\n");
  return loginProvider(options);
}

async function connectOauth(
  definition: ProviderDefinition,
  options: LoginProviderOptions,
): Promise<DreamConfig> {
  if (!definition.auth.includes("oauth")) {
    output.write(`${definition.displayName} does not support OAuth in Dream Code.\n`);
    return options.config;
  }
  if (definition.id === "openai") {
    return connectOpenAiOauth({
      config: options.config,
      configRoot: options.configRoot,
      env: options.env,
      definition,
    });
  }
  output.write(`${definition.displayName} OAuth is not wired yet.\n`);
  return options.config;
}

async function resolveLoginRegion(
  definition: ProviderDefinition,
  suppliedRegion: string | undefined,
  questioner: ProviderQuestioner,
): Promise<ProviderRegion | undefined> {
  if (shouldPromptRegion(definition, suppliedRegion)) {
    const answer = await questioner.question(regionPrompt(definition));
    return resolveRegionInput(answer, definition);
  }
  return regionForProvider(definition, suppliedRegion);
}

async function resolveBaseUrl(
  definition: ProviderDefinition,
  region: ProviderRegion,
  questioner: ProviderQuestioner,
  env: ProviderEnv,
): Promise<string | undefined> {
  const envBaseUrl = firstEnvValue(env, baseUrlEnvKeys(definition));
  if (envBaseUrl !== undefined) {
    return envBaseUrl.replace(/\/+$/u, "");
  }
  if (region.baseUrl.length > 0) {
    return region.baseUrl.replace(/\/+$/u, "");
  }

  const answer = await questioner.question("Base URL: ");
  const trimmed = answer.trim().replace(/\/+$/u, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

async function credentialForConnection(
  region: string,
  baseUrl: string,
  envKey: string | undefined,
  questioner: ProviderQuestioner,
): Promise<ProviderCredential | undefined> {
  if (envKey !== undefined) {
    output.write(`using API key from ${envKey}\n`);
    return { region, baseUrl };
  }

  const prompt = "API key: ";
  const apiKey = questioner.secret === undefined
    ? await questioner.question(prompt)
    : await questioner.secret(prompt);
  const trimmedApiKey = apiKey.trim();
  return trimmedApiKey.length > 0 ? { apiKey: trimmedApiKey, region, baseUrl } : undefined;
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

function firstEnvKey(env: ProviderEnv, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined && value.trim().length > 0) {
      return key;
    }
  }
  return undefined;
}

function firstEnvValue(env: ProviderEnv, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}
