import { ansi, paint } from "./ansi.js";
import type { ProviderEnv } from "./llm-provider.js";
import {
  apiKeyEnvKeys,
  listProviderDefinitions,
  resolveProviderDefinition,
  type ProviderDefinition,
  type ProviderRegion,
} from "./provider-registry.js";

export type LoginChoice = {
  readonly definition: ProviderDefinition;
  readonly source: "env" | "saved" | "missing";
};

export function loginChoices(
  savedProviderIds: ReadonlySet<string>,
  env: ProviderEnv,
): readonly LoginChoice[] {
  return listProviderDefinitions().map((definition) => ({
    definition,
    source: loginSource(definition, savedProviderIds, env),
  }));
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
): ProviderDefinition | undefined {
  const trimmed = selection.trim();
  const index = Number.parseInt(trimmed, 10);
  if (Number.isInteger(index) && String(index) === trimmed) {
    return choices[index - 1]?.definition;
  }
  return resolveProviderDefinition(trimmed);
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
  const auth = choice.definition.auth.join("/");
  return `${paint(number, ansi.guide)} ${choice.definition.id.padEnd(16)} ${name} ${status} ${paint(auth, ansi.dim)}\n`;
}

export function formatLoginSource(source: LoginChoice["source"]): string {
  switch (source) {
    case "env":
      return paint("env", ansi.blue);
    case "saved":
      return paint("saved", ansi.green);
    case "missing":
      return paint("missing", ansi.yellow);
    default:
      return assertNever(source);
  }
}

function loginSource(
  definition: ProviderDefinition,
  savedProviderIds: ReadonlySet<string>,
  env: ProviderEnv,
): LoginChoice["source"] {
  if (apiKeyEnvKeys(definition).some((key) => isNonEmptyString(env[key]))) {
    return "env";
  }
  return savedProviderIds.has(definition.id) ? "saved" : "missing";
}

function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected login source: ${String(value)}`);
}
