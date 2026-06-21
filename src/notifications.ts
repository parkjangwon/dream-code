import { spawn } from "node:child_process";
import { stdout } from "node:process";

import { loadConfig, type DreamConfig } from "./config.js";

export type NotificationKind = "completion" | "permissionRequired";

export type NativeNotification = {
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
};

export type NotificationCommand = {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly shell: boolean;
};

const notificationTimeoutMs = 1_200;
const maxBodyLength = 180;

export async function notifyAgentComplete(
  config: DreamConfig,
  prompt: string,
  elapsedMs: number,
): Promise<boolean> {
  if (!config.notifications.enabled || !config.notifications.completion || elapsedMs < config.notifications.minCompletionMs) {
    return false;
  }
  return sendNativeNotification({
    kind: "completion",
    title: "Dream Code",
    body: `Done in ${formatElapsed(elapsedMs)} · ${compactPrompt(prompt)}`,
  });
}

export async function notifySwarmComplete(
  config: DreamConfig,
  goal: string,
  lanes: number,
): Promise<boolean> {
  if (!config.notifications.enabled || !config.notifications.completion) {
    return false;
  }
  return sendNativeNotification({
    kind: "completion",
    title: "Dream Swarm complete",
    body: `${lanes} lanes finished · ${compactPrompt(goal)}`,
  });
}

export async function notifyPermissionRequired(
  configRoot: string,
  toolLabel: string,
): Promise<boolean> {
  const config = await loadConfig(configRoot);
  if (!config.notifications.enabled || !config.notifications.permissionRequired) {
    return false;
  }
  return sendNativeNotification({
    kind: "permissionRequired",
    title: "Dream Code needs permission",
    body: `Permission required for ${compactPrompt(toolLabel)}.`,
  });
}

export async function sendNativeNotification(
  notification: NativeNotification,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  const command = notificationCommandForPlatform(notification, env, platform);
  if (command === undefined || shouldAttemptNotification(command, env) === false) {
    return false;
  }
  return runNotificationCommand(command);
}

export function notificationCommandForPlatform(
  notification: NativeNotification,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): NotificationCommand | undefined {
  const commandEnv = { ...stringEnv(env), ...notificationEnv(notification) };
  const customCommand = env["DREAM_NOTIFICATION_COMMAND"];
  if (isNonEmptyString(customCommand)) {
    return { command: customCommand, args: [], env: commandEnv, shell: true };
  }
  if (isTermux(env)) {
    return {
      command: "termux-notification",
      args: ["--title", notification.title, "--content", notification.body],
      env: commandEnv,
      shell: false,
    };
  }
  switch (platform) {
    case "darwin":
      return {
        command: "osascript",
        args: ["-e", `display notification "${escapeAppleScript(notification.body)}" with title "${escapeAppleScript(notification.title)}"`],
        env: commandEnv,
        shell: false,
      };
    case "linux":
      return { command: "notify-send", args: [notification.title, notification.body], env: commandEnv, shell: false };
    case "win32":
      return {
        command: "powershell.exe",
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", windowsNotificationScript()],
        env: commandEnv,
        shell: false,
      };
    default:
      return undefined;
  }
}

function runNotificationCommand(command: NotificationCommand): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command.command, command.args, {
      shell: command.shell,
      env: { ...process.env, ...command.env },
      stdio: "ignore",
    });
    let settled = false;
    const timeout = setTimeout(() => {
      finish(false);
      child.kill();
    }, notificationTimeoutMs);
    const finish = (ok: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(ok);
    };
    child.on("error", () => finish(false));
    child.on("close", (code) => finish(code === 0));
  });
}

function shouldAttemptNotification(command: NotificationCommand, env: NodeJS.ProcessEnv): boolean {
  return command.shell || stdout.isTTY === true || env["DREAM_FORCE_NOTIFICATION"] === "1";
}

function notificationEnv(notification: NativeNotification): Readonly<Record<string, string>> {
  return {
    DREAM_NOTIFICATION_KIND: notification.kind,
    DREAM_NOTIFICATION_TITLE: notification.title,
    DREAM_NOTIFICATION_BODY: notification.body,
  };
}

function stringEnv(env: NodeJS.ProcessEnv): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

function isTermux(env: NodeJS.ProcessEnv): boolean {
  return isNonEmptyString(env["TERMUX_VERSION"]) || env["PREFIX"]?.includes("com.termux") === true;
}

function windowsNotificationScript(): string {
  return [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$n = New-Object System.Windows.Forms.NotifyIcon",
    "$n.Icon = [System.Drawing.SystemIcons]::Information",
    "$n.BalloonTipTitle = $env:DREAM_NOTIFICATION_TITLE",
    "$n.BalloonTipText = $env:DREAM_NOTIFICATION_BODY",
    "$n.Visible = $true",
    "$n.ShowBalloonTip(5000)",
    "Start-Sleep -Milliseconds 500",
    "$n.Dispose()",
  ].join("; ");
}

function escapeAppleScript(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"");
}

function compactPrompt(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/gu, " ");
  return normalized.length > maxBodyLength ? `${normalized.slice(0, maxBodyLength - 1)}…` : normalized;
}

function formatElapsed(elapsedMs: number): string {
  return elapsedMs < 1_000 ? `${elapsedMs}ms` : `${(elapsedMs / 1_000).toFixed(1)}s`;
}

function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}
