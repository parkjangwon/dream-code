import { slashCommands, type SlashCommand } from "./tui-commands.js";

const remoteSlashCommandNames = [
  "/artifact",
  "/btw",
  "/compact",
  "/context",
  "/doctor",
  "/drive",
  "/export",
  "/goal",
  "/loop",
  "/lsp",
  "/mcp",
  "/plan",
  "/research",
  "/review",
  "/rules",
  "/runs",
  "/status",
  "/swarm",
  "/tasks",
  "/verify",
  "/workday",
  "/workflow",
] as const;

const remoteSlashNameSet = new Set<string>(remoteSlashCommandNames);

export const remoteSlashCommands = slashCommands.filter((command) => remoteSlashNameSet.has(command.name));

export function isRemoteSlashCommandAllowed(name: string): boolean {
  return remoteSlashNameSet.has(name) || !slashCommands.some((command) => command.name === name);
}

export type RemoteSlashCommand = SlashCommand;
