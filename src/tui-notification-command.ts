import { ansi, paint } from "./ansi.js";
import { saveConfig, type DreamConfig } from "./config.js";

export async function runNotificationsCommand(
  config: DreamConfig,
  configRoot: string,
  rest: string,
): Promise<{ readonly config: DreamConfig; readonly output: string }> {
  const args = rest.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  const nextConfig = nextNotificationConfig(config, args);
  if (nextConfig === config) {
    return { config, output: `${formatNotificationStatus(config)}\n` };
  }
  await saveConfig(configRoot, nextConfig);
  return { config: nextConfig, output: `${formatNotificationStatus(nextConfig)}\n` };
}

function nextNotificationConfig(config: DreamConfig, args: readonly string[]): DreamConfig {
  const first = args[0];
  if (first === undefined) {
    return config;
  }
  if (first === "on" || first === "off") {
    return withNotifications(config, { enabled: first === "on" });
  }
  const second = args[1];
  if ((first === "completion" || first === "permission") && (second === "on" || second === "off")) {
    return withNotifications(config, {
      [first === "completion" ? "completion" : "permissionRequired"]: second === "on",
    });
  }
  return config;
}

function withNotifications(
  config: DreamConfig,
  patch: Partial<DreamConfig["notifications"]>,
): DreamConfig {
  return {
    ...config,
    notifications: {
      ...config.notifications,
      ...patch,
    },
  };
}

function formatNotificationStatus(config: DreamConfig): string {
  const settings = config.notifications;
  return [
    `${paint("Notifications", `${ansi.bold}${ansi.accent}`)} ${paint(settings.enabled ? "on" : "off", settings.enabled ? ansi.green : ansi.muted)}`,
    `${paint("completion", ansi.muted)} ${paint(settings.completion ? "on" : "off", settings.completion ? ansi.green : ansi.muted)} ${paint(`after ${formatMs(settings.minCompletionMs)}`, ansi.dim)}`,
    `${paint("permission", ansi.muted)} ${paint(settings.permissionRequired ? "on" : "off", settings.permissionRequired ? ansi.green : ansi.muted)}`,
    paint("Use /notifications on|off, /notifications completion on|off, or /notifications permission on|off.", ansi.dim),
  ].join("\n");
}

function formatMs(ms: number): string {
  return ms < 1_000 ? `${ms}ms` : `${(ms / 1_000).toFixed(0)}s`;
}
