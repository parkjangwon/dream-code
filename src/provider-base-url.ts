import type { ProviderCredential } from "./credentials.js";
import type { ProviderEnv } from "./llm-provider.js";
import {
  baseUrlEnvKeys,
  regionForProvider,
  type ProviderDefinition,
} from "./provider-registry.js";

export function providerHasRequiredBaseUrl(
  definition: ProviderDefinition,
  credential: ProviderCredential | undefined,
  env: ProviderEnv,
): boolean {
  if (!providerRequiresConfiguredBaseUrl(definition, credential)) {
    return true;
  }
  return firstProviderBaseUrlEnvKey(definition, env) !== undefined
    || nonEmpty(credential?.baseUrl);
}

export function firstProviderBaseUrlEnvKey(
  definition: ProviderDefinition,
  env: ProviderEnv,
): string | undefined {
  return baseUrlEnvKeys(definition).find((key) => nonEmpty(env[key]));
}

function providerRequiresConfiguredBaseUrl(
  definition: ProviderDefinition,
  credential: ProviderCredential | undefined,
): boolean {
  const region = regionForProvider(definition, credential?.region);
  return region === undefined || region.baseUrl.trim().length === 0;
}

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}
