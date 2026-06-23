import { installClaudePlugin, installResolvedClaudePlugin } from "./plugin-installer.js";
import {
  loadPluginMarketplaces,
  type PluginMarketplaceEntry,
  removePluginMarketplace,
  type RemovePluginMarketplaceResult,
  resolveMarketplacePlugin,
  savePluginMarketplace,
  savePluginMarketplaceSource,
  searchMarketplacePlugins,
} from "./plugin-marketplace.js";
import { loadPluginRecords, type PluginRecord } from "./plugin-registry.js";
import { uninstallPlugin, type PluginUninstallResult } from "./plugin-uninstaller.js";
import { formatPluginTrustSummary } from "./trust-summary.js";

export async function runPluginCommand(configRoot: string, args: string, cwd: string): Promise<string> {
  const trimmed = args.trim();
  if (trimmed === "" || trimmed === "list" || trimmed === "installed") {
    return formatPluginList(await loadPluginRecords(configRoot));
  }

  if (trimmed === "marketplace" || trimmed === "marketplace list") {
    return formatMarketplaces(await loadPluginMarketplaces(configRoot));
  }

  const marketplaceRemove = parseMarketplaceRemove(trimmed);
  if (marketplaceRemove !== undefined) {
    return formatMarketplaceRemove(await removePluginMarketplace(configRoot, marketplaceRemove));
  }

  const marketplaceAdd = parseMarketplaceAdd(trimmed);
  if (marketplaceAdd !== undefined) {
    const record = marketplaceAdd.kind === "source"
      ? await savePluginMarketplaceSource(configRoot, marketplaceAdd.source, cwd)
      : await savePluginMarketplace(configRoot, marketplaceAdd.name, marketplaceAdd.url);
    return `marketplace added: ${record.name} ${record.url}\n`;
  }

  const searchQuery = parseSearchQuery(trimmed);
  if (searchQuery !== undefined) {
    return formatMarketplaceSearch(await searchMarketplacePlugins(configRoot, searchQuery, cwd));
  }

  const uninstallSpec = parseUninstallSpec(trimmed);
  if (uninstallSpec !== undefined) {
    return formatPluginUninstall(await uninstallPlugin(configRoot, uninstallSpec));
  }

  const installSource = parseInstallSource(trimmed);
  if (installSource === undefined) {
    return [
      "usage: /plugin install <path-or-git-url>",
      "       /plugin install <plugin>@<marketplace>",
      "       /plugin marketplace",
      "       /plugin marketplace add <source>",
      "       /plugin marketplace add <name> <marketplace-json-url-or-path>",
      "       /plugin marketplace remove <name>",
      "       /plugin search <query>",
      "       /plugin uninstall <plugin>",
      "",
    ].join("\n");
  }

  const marketplaceSource = await resolveMarketplacePlugin(configRoot, installSource, cwd);
  const result = marketplaceSource === undefined
    ? await installClaudePlugin(configRoot, installSource, cwd)
    : await installResolvedClaudePlugin(configRoot, marketplaceSource, cwd);
  const record = result.record;
  return [
    `plugin installed: ${record.name}`,
    `path ${result.pluginRoot}`,
    `imported ${record.skills} skill(s), ${record.agents} agent(s), ${record.commands} command(s), ${record.mcpServers} MCP server(s)`,
    formatPluginTrustSummary(record),
    "Use /skills, /agents, and /mcp to review imported capabilities.",
    "",
  ].join("\n");
}

function formatPluginUninstall(result: PluginUninstallResult): string {
  if (result.kind === "missing") {
    return `plugin uninstall skipped: ${result.spec} is not installed\n`;
  }
  return [
    `plugin uninstalled: ${result.record.name}`,
    `removed ${result.removedSkills} skill(s), ${result.removedAgents} agent(s), ${result.removedMcpServers} MCP server(s)`,
    "",
  ].join("\n");
}

function formatPluginList(records: readonly PluginRecord[]): string {
  if (records.length === 0) {
    return "Plugins\nNo plugins installed.\nUse /plugin install <path-or-git-url>.\n";
  }
  const lines = records.map((record) => {
    const version = record.version === undefined ? "" : ` ${record.version}`;
    return `${record.name}${version} · ${record.skills} skills · ${record.agents} agents · ${record.commands} commands · ${record.mcpServers} MCP · trust: ${record.trust.commandSurfaces} command, ${record.trust.mcpCommands.length} MCP command`;
  });
  return ["Plugins", ...lines, ""].join("\n");
}

function formatMarketplaces(records: readonly { readonly name: string; readonly url: string; readonly addedAt: string }[]): string {
  return [
    "Plugin Marketplaces",
    ...records.map((record) => `${record.name.padEnd(14)} ${record.addedAt === "builtin" ? "builtin" : "saved"} ${record.url}`),
    "",
  ].join("\n");
}

function formatMarketplaceRemove(result: RemovePluginMarketplaceResult): string {
  switch (result.kind) {
    case "removed":
      return `marketplace removed: ${result.name}\n`;
    case "builtin":
      return `marketplace remove skipped: ${result.name} is built in\n`;
    case "missing":
      return `marketplace remove skipped: ${result.name} was not saved\n`;
    default:
      return assertNever(result);
  }
}

function formatMarketplaceSearch(entries: readonly PluginMarketplaceEntry[]): string {
  if (entries.length === 0) {
    return "Plugin search\nNo marketplace plugins found.\n";
  }
  return [
    "Plugin search",
    ...entries.map((entry) => `${entry.name}@${entry.marketplace} ${entry.description ?? ""}`.trim()),
    "",
  ].join("\n");
}

function parseInstallSource(args: string): string | undefined {
  const parts = args.split(/\s+/u);
  const [command, ...rest] = parts;
  if (command !== "install") {
    return undefined;
  }
  const source = rest.join(" ").trim();
  return source === "" ? undefined : source;
}

function parseUninstallSpec(args: string): string | undefined {
  const match = /^(?:uninstall|remove|delete)\s+(.+)$/u.exec(args);
  const spec = match?.[1]?.trim();
  return spec === undefined || spec === "" ? undefined : spec;
}

type MarketplaceAdd =
  | { readonly kind: "legacy"; readonly name: string; readonly url: string }
  | { readonly kind: "source"; readonly source: string };

function parseMarketplaceAdd(args: string): MarketplaceAdd | undefined {
  const match = /^market(?:place)?\s+add\s+(.+)$/u.exec(args);
  const rest = match?.[1]?.trim();
  if (rest === undefined || rest === "") {
    return undefined;
  }
  const legacy = /^(\S+)\s+(.+)$/u.exec(rest);
  if (legacy?.[1] !== undefined && legacy[2] !== undefined && looksLikeMarketplaceName(legacy[1])) {
    return { kind: "legacy", name: legacy[1], url: legacy[2].trim() };
  }
  return { kind: "source", source: rest };
}

function parseMarketplaceRemove(args: string): string | undefined {
  const match = /^market(?:place)?\s+(?:remove|delete)\s+(.+)$/u.exec(args);
  const name = match?.[1]?.trim();
  return name === undefined || name === "" ? undefined : name;
}

function parseSearchQuery(args: string): string | undefined {
  const match = /^search(?:\s+(.+))?$/u.exec(args);
  return match === null ? undefined : (match[1] ?? "");
}

function looksLikeMarketplaceName(value: string): boolean {
  return /^[a-zA-Z0-9._-]+$/u.test(value);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected plugin command result: ${String(value)}`);
}
