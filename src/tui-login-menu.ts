import { ansi, paint } from "./ansi.js";
import type { ProviderCredential } from "./credentials.js";
import type { ProviderEnv } from "./llm-provider.js";
import { providerHasRequiredBaseUrl } from "./provider-base-url.js";
import {
  apiKeyEnvKeys,
  baseUrlEnvKeys,
  listProviderDefinitions,
  resolveProviderDefinition,
  type ProviderDefinition,
  type ProviderAuthMode,
  type ProviderRegion,
} from "./provider-registry.js";

export type LoginChoice = {
  readonly definition: ProviderDefinition;
  readonly authMode: ProviderAuthMode;
  readonly source: "env" | "saved" | "missing";
};

export function loginChoices(
  providers: Readonly<Record<string, ProviderCredential>>,
  env: ProviderEnv,
): readonly LoginChoice[] {
  return listProviderDefinitions().flatMap((definition) => choicesForDefinition(definition, providers, env));
}

export function formatLoginMenu(
  choices: readonly LoginChoice[],
): string {
  const lines = [`${paint("Login", ansi.accent)}\n`];
  for (let index = 0; index < choices.length; index += 1) {
    const choice = choices[index];
    if (choice !== undefined) {
      lines.push(formatLoginMenuLine(index + 1, choice));
    }
  }
  lines.push("Select a provider by name or number.\n");
  return lines.join("");
}

export function resolveLoginSelection(
  selection: string,
  choices: readonly LoginChoice[],
): LoginChoice | undefined {
  const trimmed = selection.trim();
  const index = Number.parseInt(trimmed, 10);
  if (Number.isInteger(index) && String(index) === trimmed) {
    return choices[index - 1];
  }
  return resolveChoiceByText(trimmed, choices);
}

export function shouldPromptRegion(definition: ProviderDefinition, suppliedRegion: string | undefined): boolean {
  return suppliedRegion === undefined && definition.regions.length > 1;
}

export function regionPrompt(definition: ProviderDefinition): string {
  return `Region [${definition.regions.map((region) => region.id).join("/")}]: `;
}

export function resolveRegionInput(
  input: string,
  definition: ProviderDefinition,
): ProviderRegion | undefined {
  const trimmed = input.trim();
  const regionId = trimmed.length === 0 ? definition.defaultRegion : trimmed;
  return definition.regions.find((region) => region.id === regionId);
}

function formatLoginMenuLine(index: number, choice: LoginChoice): string {
  const number = `${index}.`.padStart(3);
  const name = choice.definition.displayName.padEnd(20);
  const status = formatLoginSource(choice.source).padEnd(10);
  return `${paint(number, ansi.guide)} ${choice.definition.id.padEnd(16)} ${name} ${status} ${paint(authLabel(choice), ansi.dim)}\n`;
}

export function formatLoginSource(source: LoginChoice["source"]): string {
  switch (source) {
    case "env":
      return paint("env", `${ansi.bold}${ansi.blue}`);
    case "saved":
      return paint("saved", `${ansi.bold}${ansi.green}`);
    case "missing":
      return paint("not set", `${ansi.bold}${ansi.yellow}`);
    default:
      return assertNever(source);
  }
}

function loginSource(
  definition: ProviderDefinition,
  authMode: LoginChoice["authMode"],
  credential: ProviderCredential | undefined,
  env: ProviderEnv,
): LoginChoice["source"] {
  if (authMode === "api-key") {
    if (apiKeyEnvKeys(definition).some((key) => isNonEmptyString(env[key]))
      && providerHasRequiredBaseUrl(definition, credential, env)) {
      return "env";
    }
    return isNonEmptyString(credential?.apiKey)
      && providerHasRequiredBaseUrl(definition, credential, env)
      ? "saved"
      : "missing";
  }
  if (authMode === "none") {
    if (baseUrlEnvKeys(definition).some((key) => isNonEmptyString(env[key]))) {
      return "env";
    }
    return credential?.authMode === "none" || isNonEmptyString(credential?.baseUrl) ? "saved" : "missing";
  }
  return credential?.authMode === "oauth" ? "saved" : "missing";
}

function choicesForDefinition(
  definition: ProviderDefinition,
  providers: Readonly<Record<string, ProviderCredential>>,
  env: ProviderEnv,
): readonly LoginChoice[] {
  const credential = providers[definition.id];
  return definition.auth.map((authMode) => ({
    definition,
    authMode,
    source: loginSource(definition, authMode, credential, env),
  }));
}

function resolveChoiceByText(
  text: string,
  choices: readonly LoginChoice[],
): LoginChoice | undefined {
  const normalized = text.toLowerCase();
  const [providerPart, authPart] = normalized.split(":");
  const definition = providerPart === undefined ? undefined : resolveProviderDefinition(providerPart);
  if (definition === undefined) {
    return undefined;
  }
  const requestedAuth = requestedAuthMode(authPart, definition);
  return choices.find((choice) => choice.definition.id === definition.id && choice.authMode === requestedAuth);
}

export function loginChoiceValue(choice: LoginChoice): string {
  if (choice.authMode === "none") {
    return `${choice.definition.id}:none`;
  }
  return choice.authMode === "oauth" ? `${choice.definition.id}:oauth` : choice.definition.id;
}

export function authLabel(choice: LoginChoice): string {
  switch (choice.authMode) {
    case "api-key":
      return "(api)";
    case "oauth":
      return "(oauth)";
    case "none":
      return "(none)";
    default:
      return assertNever(choice.authMode);
  }
}

function requestedAuthMode(authPart: string | undefined, definition: ProviderDefinition): ProviderAuthMode {
  if (authPart === "oauth" || authPart === "subscription") {
    return "oauth";
  }
  if (authPart === "none" || authPart === "local" || authPart === "no-auth") {
    return "none";
  }
  return definition.auth.includes("api-key") ? "api-key" : definition.auth[0] ?? "api-key";
}

function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected login source: ${String(value)}`);
}
