import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import {
  parseConfigToml,
  serializeMainConfigToml,
  serializeModelConfigToml,
  TomlConfigParseError,
} from "./config-toml.js";
import { defaultModelConfig, normalizeLoadedConfig } from "./config-model.js";
import { modelConfigSchema } from "./model-routing.js";

export const permissionModeSchema = z.enum(["ask", "auto", "plan", "yolo"]);
export type PermissionMode = z.infer<typeof permissionModeSchema>;

const teamMemberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  mission: z.string().min(1),
  enabled: z.boolean(),
});

const tokenSavingSchema = z.object({
  enabled: z.boolean(),
  contextBudgetPercent: z.number().int().min(10).max(95),
  preferSummaries: z.boolean(),
  useRipgrepFirst: z.boolean(),
});

const providerSettingSchema = z.object({
  enabled: z.boolean(),
});

const notificationSettingsSchema = z.object({
  enabled: z.boolean(),
  completion: z.boolean(),
  permissionRequired: z.boolean(),
  minCompletionMs: z.number().int().min(0).max(3_600_000),
}).default({
  enabled: true,
  completion: true,
  permissionRequired: true,
  minCompletionMs: 10_000,
});

export const dreamConfigSchema = z.object({
  version: z.literal(1),
  permissions: z.object({
    mode: permissionModeSchema,
  }),
  providers: z.record(z.string(), providerSettingSchema).default({}),
  notifications: notificationSettingsSchema,
  model: modelConfigSchema,
  tokenSaving: tokenSavingSchema,
  tools: z.object({
    ripgrep: z.boolean(),
    lsp: z.boolean(),
    webResearch: z.boolean(),
  }),
  team: z.array(teamMemberSchema),
});

export type DreamConfig = z.infer<typeof dreamConfigSchema>;

const mainConfigSchema = dreamConfigSchema.omit({ model: true, team: true });
const modelFileSchema = z.object({
  version: z.literal(1),
  model: modelConfigSchema,
});
export class ConfigParseError extends Error {
  readonly filePath: string;

  constructor(filePath: string, reason: string) {
    super(`Could not parse Dream Code config at ${filePath}: ${reason}`);
    this.name = "ConfigParseError";
    this.filePath = filePath;
  }
}

export function defaultConfig(): DreamConfig {
  return {
    version: 1,
    permissions: { mode: "yolo" },
    providers: {},
    notifications: {
      enabled: true,
      completion: true,
      permissionRequired: true,
      minCompletionMs: 10_000,
    },
    model: defaultModelConfig(),
    tokenSaving: {
      enabled: true,
      contextBudgetPercent: 70,
      preferSummaries: true,
      useRipgrepFirst: true,
    },
    tools: {
      ripgrep: true,
      lsp: true,
      webResearch: true,
    },
    team: [
      { id: "architect", name: "Dream Architect", role: "architecture", mission: "Turn goals into small, verifiable plans.", enabled: true },
      { id: "builder", name: "Night Builder", role: "implementation", mission: "Ship focused code changes with tests.", enabled: true },
      { id: "reviewer", name: "Morning Reviewer", role: "review", mission: "Find regressions before the user wakes up.", enabled: true },
      { id: "researcher", name: "Web Researcher", role: "research", mission: "Bring fresh external context when local knowledge is stale.", enabled: true },
    ],
  };
}

export function defaultConfigRoot(): string {
  const dreamHome = process.env["DREAM_CODE_HOME"];
  if (isNonEmptyString(dreamHome)) {
    return dreamHome;
  }

  const xdgConfigHome = process.env["XDG_CONFIG_HOME"];
  if (isNonEmptyString(xdgConfigHome)) {
    return join(xdgConfigHome, "dream-code");
  }

  return join(homedir(), ".dream");
}

export function configFilePath(root = defaultConfigRoot()): string {
  return join(root, "config.toml");
}

export function modelConfigFilePath(root = defaultConfigRoot()): string {
  return join(root, "models.toml");
}

export async function loadConfig(root = defaultConfigRoot()): Promise<DreamConfig> {
  const defaults = defaultConfig();
  const mainConfig = await loadMainConfig(root, defaults);
  const model = await loadModelConfig(root, defaults.model);
  return normalizeLoadedConfig({ ...mainConfig, model, team: defaults.team });
}

export async function saveConfig(root: string, config: DreamConfig): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(configFilePath(root), serializeMainConfigToml(config), "utf8");
  await writeFile(modelConfigFilePath(root), serializeModelConfigToml(config.model), "utf8");
}

async function loadMainConfig(root: string, defaults: DreamConfig): Promise<Omit<DreamConfig, "model" | "team">> {
  const parsed = await loadTomlFile(configFilePath(root));
  if (parsed === undefined) {
    return {
      version: defaults.version,
      permissions: defaults.permissions,
      providers: defaults.providers,
      notifications: defaults.notifications,
      tokenSaving: defaults.tokenSaving,
      tools: defaults.tools,
    };
  }
  return parseWithSchema(configFilePath(root), parsed, mainConfigSchema);
}

async function loadModelConfig(root: string, defaults: DreamConfig["model"]): Promise<DreamConfig["model"]> {
  const filePath = modelConfigFilePath(root);
  const parsed = await loadTomlFile(filePath);
  return parsed === undefined ? defaults : parseWithSchema(filePath, parsed, modelFileSchema).model;
}

async function loadTomlFile(filePath: string): Promise<unknown | undefined> {
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  try {
    return parseConfigToml(raw);
  } catch (error) {
    if (error instanceof TomlConfigParseError) {
      throw new ConfigParseError(filePath, error.message);
    }
    throw error;
  }
}

function parseWithSchema<T>(filePath: string, value: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ConfigParseError(filePath, parsed.error.message);
  }
  return parsed.data;
}

export async function togglePersistedYolo(root = defaultConfigRoot()): Promise<DreamConfig> {
  const config = await loadConfig(root);
  const nextMode: PermissionMode = config.permissions.mode === "yolo" ? "ask" : "yolo";
  const nextConfig: DreamConfig = {
    ...config,
    permissions: { mode: nextMode },
  };

  await saveConfig(root, nextConfig);
  return nextConfig;
}

export function resolveEffectivePermissionMode(
  config: DreamConfig,
  oneShotYolo: boolean,
): PermissionMode {
  return oneShotYolo ? "yolo" : config.permissions.mode;
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}
