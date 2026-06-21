import { permissionModeSchema, saveConfig, type DreamConfig, type PermissionMode } from "./config.js";
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
  const mode = parsePermissionMode(args);
  if (mode === undefined) {
    return {
      config,
      output: [
        "usage: /permission <ask|auto|plan|yolo>",
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
