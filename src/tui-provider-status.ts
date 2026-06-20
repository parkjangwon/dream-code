import { ansi, paint } from "./ansi.js";
import type { ProviderCredential } from "./credentials.js";
import type { ProviderEnv } from "./llm-provider.js";
import {
  apiKeyEnvKeys,
  type ProviderDefinition,
} from "./provider-registry.js";

type CredentialSource =
  | { readonly kind: "env"; readonly key: string }
  | { readonly kind: "oauth" }
  | { readonly kind: "saved" }
  | { readonly kind: "missing" };

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
): string {
  const source = credentialSource(definition, credential, env);
  const status = formatCredentialSource(source);
  const regions = definition.regions.map((region) => region.id).join("/");
  return `${definition.id.padEnd(16)} ${definition.displayName.padEnd(18)} ${status.padEnd(12)} ${regions}\n`;
}

function credentialSource(
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
