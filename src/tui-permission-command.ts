import { permissionModeSchema, saveConfig, type DreamConfig, type PermissionMode } from "./config.js";
import { defaultAllowedShellExecutables } from "./shell-command.js";
import { formatPermissionMode } from "./tui-render.js";

export type PermissionCommandResult = {
  readonly config: DreamConfig;
  readonly output: string;
};

export async function runPermissionCommand(
  config: DreamConfig,
  configRoot: string,
  args: string,
  oneShotYolo: boolean,
): Promise<PermissionCommandResult> {
  const preset = parsePermissionPreset(args);
  if (preset !== undefined) {
    const nextConfig = applyPermissionPreset(config, preset);
    await saveConfig(configRoot, nextConfig);
    return {
      config: nextConfig,
      output: [
        `preset ${preset} applied`,
        `permission ${formatPermissionMode(nextConfig.permissions.mode, oneShotYolo)}`,
        `shell allowlist ${nextConfig.tools.shell.allowedExecutables.join(", ")}`,
        "",
      ].join("\n"),
    };
  }

  const mode = parsePermissionMode(args);
  if (mode === undefined) {
    return {
      config,
      output: [
        "usage: /permission <ask|auto|plan|yolo>",
        "       /permission preset <safe|edit|release|danger>",
        `current: ${formatPermissionMode(config.permissions.mode, oneShotYolo)}`,
        "",
      ].join("\n"),
    };
  }

  const nextConfig: DreamConfig = { ...config, permissions: { mode } };
  await saveConfig(configRoot, nextConfig);
  return {
    config: nextConfig,
    output: `${formatPermissionMode(mode, oneShotYolo)}\n`,
  };
}

function parsePermissionMode(args: string): PermissionMode | undefined {
  const parsed = permissionModeSchema.safeParse(args.trim());
  return parsed.success ? parsed.data : undefined;
}

type PermissionPreset = "safe" | "edit" | "release" | "danger";

const safeShellAllowlist = ["cat", "date", "find", "git", "head", "ls", "pwd", "rg", "sed", "tail", "wc"] as const;
const editShellAllowlist = [...safeShellAllowlist, "awk", "node", "npm", "npx", "pnpm", "tsc"] as const;
const releaseShellAllowlist = [...editShellAllowlist, "bun", "cargo", "deno", "go", "python", "python3"] as const;

function parsePermissionPreset(args: string): PermissionPreset | undefined {
  const parts = args.trim().split(/\s+/u);
  if (parts.length !== 2 || parts[0] !== "preset") {
    return undefined;
  }
  return isPermissionPreset(parts[1]) ? parts[1] : undefined;
}

function applyPermissionPreset(config: DreamConfig, preset: PermissionPreset): DreamConfig {
  switch (preset) {
    case "safe":
      return configWithPolicy(config, "ask", safeShellAllowlist);
    case "edit":
      return configWithPolicy(config, "auto", editShellAllowlist);
    case "release":
      return configWithPolicy(config, "plan", releaseShellAllowlist);
    case "danger":
      return configWithPolicy(config, "yolo", defaultAllowedShellExecutables);
  }
}

function configWithPolicy(
  config: DreamConfig,
  mode: PermissionMode,
  allowedExecutables: readonly string[],
): DreamConfig {
  return {
    ...config,
    permissions: { mode },
    tools: {
      ...config.tools,
      shell: {
        allowedExecutables: [...allowedExecutables],
      },
    },
  };
}

function isPermissionPreset(value: string | undefined): value is PermissionPreset {
  return value === "safe" || value === "edit" || value === "release" || value === "danger";
}
