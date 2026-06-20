import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { defaultConfigRoot } from "./config.js";
import { parseConfigToml, TomlConfigParseError } from "./config-toml.js";

const skillSettingsSchema = z.object({
  version: z.literal(1),
  disabled: z.array(z.string()),
});

export type SkillSettings = z.infer<typeof skillSettingsSchema>;

type ErrnoException = Error & { readonly code?: string };

export function defaultSkillSettings(): SkillSettings {
  return { version: 1, disabled: [] };
}

export function skillSettingsFilePath(root = defaultConfigRoot()): string {
  return join(root, "skills.toml");
}

export async function loadSkillSettings(root = defaultConfigRoot()): Promise<SkillSettings> {
  const filePath = skillSettingsFilePath(root);
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return defaultSkillSettings();
    }
    throw error;
  }

  try {
    return skillSettingsSchema.parse(parseConfigToml(raw));
  } catch (error) {
    if (error instanceof TomlConfigParseError || error instanceof z.ZodError) {
      throw new SkillSettingsParseError(filePath, error.message);
    }
    throw error;
  }
}

export async function toggleSkill(root: string, skillName: string): Promise<SkillSettings> {
  const settings = await loadSkillSettings(root);
  const disabled = new Set(settings.disabled);
  if (disabled.has(skillName)) {
    disabled.delete(skillName);
  } else {
    disabled.add(skillName);
  }
  const next: SkillSettings = { version: 1, disabled: [...disabled].sort() };
  await saveSkillSettings(root, next);
  return next;
}

export function skillEnabled(settings: SkillSettings, skillName: string): boolean {
  return !settings.disabled.includes(skillName);
}

export async function saveSkillSettings(root: string, settings: SkillSettings): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(skillSettingsFilePath(root), serializeSkillSettings(settings), "utf8");
}

function serializeSkillSettings(settings: SkillSettings): string {
  return [
    "version = 1",
    `disabled = [${settings.disabled.map((name) => JSON.stringify(name)).join(", ")}]`,
    "",
  ].join("\n");
}

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error;
}

export class SkillSettingsParseError extends Error {
  readonly filePath: string;

  constructor(filePath: string, reason: string) {
    super(`Could not parse Dream Code skill settings at ${filePath}: ${reason}`);
    this.name = "SkillSettingsParseError";
    this.filePath = filePath;
  }
}
