import { ansi, paint } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import type { ProviderCredential } from "./credentials.js";
import type { ProviderEnv } from "./llm-provider.js";
import { providerIsEnabled } from "./provider-settings.js";
import {
  apiKeyEnvKeys,
  type ProviderDefinition,
} from "./provider-registry.js";

type CredentialSource =
  | { readonly kind: "disabled" }
  | { readonly kind: "env"; readonly key: string }
  | { readonly kind: "oauth" }
  | { readonly kind: "saved" }
  | { readonly kind: "missing" };

export type ProviderConnectionSource = CredentialSource["kind"];

export function savedProviderIds(
  providers: Readonly<Record<string, ProviderCredential>>,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const [id, credential] of Object.entries(providers)) {
    if (credential.apiKey !== undefined || credential.authMode === "oauth") {
      ids.add(id);
    }
  }
  return ids;
}

export function formatProviderLine(
  definition: ProviderDefinition,
  credential: ProviderCredential | undefined,
  env: ProviderEnv,
  config?: DreamConfig,
): string {
  const source = config !== undefined && !providerIsEnabled(config, definition.id)
    ? { kind: "disabled" as const }
    : providerConnection(definition, credential, env);
  const status = formatCredentialSource(source);
  const regions = definition.regions.map((region) => region.id).join("/");
  return `${definition.id.padEnd(16)} ${definition.displayName.padEnd(18)} ${status.padEnd(12)} ${regions}\n`;
}

export function isProviderConnected(
  definition: ProviderDefinition,
  credential: ProviderCredential | undefined,
  env: ProviderEnv,
  config?: DreamConfig,
): boolean {
  if (config !== undefined && !providerIsEnabled(config, definition.id)) {
    return false;
  }
  return providerConnection(definition, credential, env).kind !== "missing";
}

export function providerConnectionSource(
  definition: ProviderDefinition,
  credential: ProviderCredential | undefined,
  env: ProviderEnv,
): ProviderConnectionSource {
  return providerConnection(definition, credential, env).kind;
}

function providerConnection(
  definition: ProviderDefinition,
  credential: ProviderCredential | undefined,
  env: ProviderEnv,
): CredentialSource {
  const envKey = firstEnvKey(env, apiKeyEnvKeys(definition));
  if (envKey !== undefined) {
    return { kind: "env", key: envKey };
  }
  if (credential?.authMode === "oauth") {
    return { kind: "oauth" };
  }
  if (credential?.apiKey !== undefined) {
    return { kind: "saved" };
  }
  return { kind: "missing" };
}

function formatCredentialSource(source: CredentialSource): string {
  switch (source.kind) {
    case "disabled":
      return paint("disabled", ansi.red);
    case "env":
      return paint(`env:${source.key}`, ansi.green);
    case "oauth":
      return paint("oauth", ansi.green);
    case "saved":
      return paint("saved", ansi.green);
    case "missing":
      return paint("missing", ansi.yellow);
    default:
      return assertNever(source);
  }
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

function assertNever(value: never): never {
  throw new Error(`Unexpected credential source: ${String(value)}`);
}
