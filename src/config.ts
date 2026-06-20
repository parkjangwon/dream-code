import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { modelConfigSchema } from "./model-routing.js";
import type { ModelConfig } from "./model-routing.js";
import { providerModelIdForRequest } from "./provider-registry.js";

export const permissionModeSchema = z.enum(["ask", "auto", "yolo"]);
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

export const dreamConfigSchema = z.object({
  version: z.literal(1),
  permissions: z.object({
    mode: permissionModeSchema,
  }),
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
    permissions: { mode: "ask" },
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
      {
        id: "architect",
        name: "Dream Architect",
        role: "architecture",
        mission: "Turn goals into small, verifiable plans.",
        enabled: true,
      },
      {
        id: "builder",
        name: "Night Builder",
        role: "implementation",
        mission: "Ship focused code changes with tests.",
        enabled: true,
      },
      {
        id: "reviewer",
        name: "Morning Reviewer",
        role: "review",
        mission: "Find regressions before the user wakes up.",
        enabled: true,
      },
      {
        id: "researcher",
        name: "Web Researcher",
        role: "research",
        mission: "Bring fresh external context when local knowledge is stale.",
        enabled: true,
      },
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
  return join(root, "config.json");
}

export async function loadConfig(root = defaultConfigRoot()): Promise<DreamConfig> {
  const filePath = configFilePath(root);
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return defaultConfig();
    }
    throw error;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ConfigParseError(filePath, error.message);
    }
    throw error;
  }

  const parsedConfig = dreamConfigSchema.safeParse(parsedJson);
  if (!parsedConfig.success) {
    throw new ConfigParseError(filePath, parsedConfig.error.message);
  }

  return normalizeLoadedConfig(parsedConfig.data);
}

export async function saveConfig(root: string, config: DreamConfig): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(configFilePath(root), `${JSON.stringify(config, null, 2)}\n`, "utf8");
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

function defaultModelConfig(): ModelConfig {
  return {
    mode: "single",
    single: {
      provider: "openai",
      models: {
        low: "gpt-4.1-mini",
        mid: "gpt-4.1",
        high: "o3",
      },
      defaultTier: "mid",
    },
    auto: {
      routes: [
        {
          id: "fast-classifier",
          provider: "openai",
          model: "gpt-4.1-mini",
          tier: "low",
          match: ["classify", "summarize", "rename", "grep"],
        },
        {
          id: "deep-builder",
          provider: "openai",
          model: "o3",
          tier: "high",
          match: ["architecture", "debug", "refactor", "review"],
        },
      ],
    },
  };
}

function normalizeLoadedConfig(config: DreamConfig): DreamConfig {
  return {
    ...config,
    model: {
      ...config.model,
      single: {
        ...config.model.single,
        models: {
          low: providerModelIdForRequest(config.model.single.provider, config.model.single.models.low),
          mid: providerModelIdForRequest(config.model.single.provider, config.model.single.models.mid),
          high: providerModelIdForRequest(config.model.single.provider, config.model.single.models.high),
        },
      },
      auto: {
        routes: config.model.auto.routes.map((route) => ({
          ...route,
          model: providerModelIdForRequest(route.provider, route.model),
        })),
      },
    },
  };
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
