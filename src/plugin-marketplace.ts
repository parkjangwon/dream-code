import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { request } from "undici";
import { z } from "zod";

import type { ClaudePluginInstallSource } from "./plugin-installer.js";

const marketplaceSourceObjectSchema = z.object({
  source: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  ref: z.string().min(1).optional(),
  sha: z.string().min(1).optional(),
}).passthrough();

const marketplacePluginSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  source: z.union([z.string().min(1), marketplaceSourceObjectSchema]),
}).passthrough();

const marketplaceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  plugins: z.array(marketplacePluginSchema),
}).passthrough();

const marketplaceRecordSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  addedAt: z.string().min(1),
});

const marketplaceRegistrySchema = z.object({
  version: z.literal(1),
  marketplaces: z.array(marketplaceRecordSchema),
});

export type PluginMarketplaceRecord = z.infer<typeof marketplaceRecordSchema>;
export type PluginMarketplaceEntry = z.infer<typeof marketplacePluginSchema> & {
  readonly marketplace: string;
};

const officialMarketplace: PluginMarketplaceRecord = {
  name: "official",
  url: "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json",
  addedAt: "builtin",
};

export function pluginMarketplaceRegistryPath(root: string): string {
  return join(root, "plugins", "marketplaces.json");
}

export async function loadPluginMarketplaces(root: string): Promise<readonly PluginMarketplaceRecord[]> {
  const saved = await loadSavedMarketplaces(root);
  return [officialMarketplace, ...saved.filter((record) => record.name !== officialMarketplace.name)];
}

export async function savePluginMarketplace(root: string, name: string, url: string): Promise<PluginMarketplaceRecord> {
  const record = { name: normalizeName(name), url, addedAt: new Date().toISOString() };
  const existing = (await loadSavedMarketplaces(root)).filter((item) => item.name !== record.name);
  const next = [...existing, record].sort((left, right) => left.name.localeCompare(right.name));
  await mkdir(join(root, "plugins"), { recursive: true, mode: 0o700 });
  await writeFile(pluginMarketplaceRegistryPath(root), `${JSON.stringify({ version: 1, marketplaces: next }, null, 2)}\n`, "utf8");
  return record;
}

export async function searchMarketplacePlugins(root: string, query: string, cwd: string): Promise<readonly PluginMarketplaceEntry[]> {
  const normalizedQuery = query.trim().toLowerCase();
  const marketplaces = await loadPluginMarketplaces(root);
  const entries = await Promise.all(marketplaces.map((marketplace) => loadMarketplaceEntries(marketplace, cwd)));
  return entries.flat()
    .filter((entry) => normalizedQuery === "" || entry.name.toLowerCase().includes(normalizedQuery) || (entry.description ?? "").toLowerCase().includes(normalizedQuery))
    .slice(0, 20);
}

export async function resolveMarketplacePlugin(root: string, spec: string, cwd: string): Promise<ClaudePluginInstallSource | undefined> {
  const parsed = parseMarketplaceSpec(spec);
  if (parsed === undefined) {
    return undefined;
  }
  const marketplace = (await loadPluginMarketplaces(root)).find((record) => record.name === parsed.marketplace);
  if (marketplace === undefined) {
    return undefined;
  }
  const loaded = await loadMarketplace(marketplace, cwd);
  const plugin = loaded.plugins.find((entry) => entry.name === parsed.plugin);
  if (plugin === undefined) {
    return undefined;
  }
  return installSourceForPlugin(marketplace, plugin.source, `${parsed.plugin}@${parsed.marketplace}`, cwd);
}

async function loadSavedMarketplaces(root: string): Promise<readonly PluginMarketplaceRecord[]> {
  try {
    const raw = await readFile(pluginMarketplaceRegistryPath(root), "utf8");
    const parsedJson: unknown = JSON.parse(raw);
    const parsed = marketplaceRegistrySchema.safeParse(parsedJson);
    return parsed.success ? parsed.data.marketplaces : [];
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    if (error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }
}

async function loadMarketplaceEntries(marketplace: PluginMarketplaceRecord, cwd: string): Promise<readonly PluginMarketplaceEntry[]> {
  const loaded = await loadMarketplace(marketplace, cwd);
  return loaded.plugins.map((plugin) => ({ ...plugin, marketplace: marketplace.name }));
}

async function loadMarketplace(marketplace: PluginMarketplaceRecord, cwd: string): Promise<z.infer<typeof marketplaceSchema>> {
  const raw = isHttpUrl(marketplace.url) ? await readHttpText(marketplace.url) : await readFile(resolveLocalPath(marketplace.url, cwd), "utf8");
  const parsedJson: unknown = JSON.parse(raw);
  const parsed = marketplaceSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new PluginMarketplaceError(`Invalid marketplace ${marketplace.name}: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function readHttpText(url: string): Promise<string> {
  const response = await request(url, { method: "GET", headersTimeout: 8_000, bodyTimeout: 12_000 });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new PluginMarketplaceError(`Marketplace request failed: HTTP ${response.statusCode}`);
  }
  return response.body.text();
}

function installSourceForPlugin(
  marketplace: PluginMarketplaceRecord,
  source: z.infer<typeof marketplacePluginSchema>["source"],
  label: string,
  cwd: string,
): ClaudePluginInstallSource {
  if (typeof source === "string") {
    return installSourceForString(marketplace, source, label, cwd);
  }
  if (source.url === undefined) {
    throw new PluginMarketplaceError(`Marketplace plugin ${label} has no source URL`);
  }
  return {
    location: source.url,
    ...(source.path === undefined ? {} : { subdir: source.path }),
    ...(source.ref === undefined ? {} : { ref: source.ref }),
    label,
  };
}

function installSourceForString(
  marketplace: PluginMarketplaceRecord,
  source: string,
  label: string,
  cwd: string,
): ClaudePluginInstallSource {
  if (isGitLikeSource(source) || isHttpUrl(source)) {
    return { location: source, label };
  }
  const github = githubSourceFromMarketplace(marketplace.url, source);
  if (github !== undefined) {
    return { ...github, label };
  }
  return { location: resolve(dirname(resolveLocalPath(marketplace.url, cwd)), source), label };
}

function githubSourceFromMarketplace(marketplaceUrl: string, source: string): Omit<ClaudePluginInstallSource, "label"> | undefined {
  const match = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/u.exec(marketplaceUrl);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined || match[4] === undefined) {
    return undefined;
  }
  const subdir = normalizeSubdir(source);
  return {
    location: `https://github.com/${match[1]}/${match[2]}.git`,
    ref: match[3],
    subdir,
  };
}

function parseMarketplaceSpec(spec: string): { readonly plugin: string; readonly marketplace: string } | undefined {
  if (spec.startsWith("git@")) {
    return undefined;
  }
  const match = /^([^@\s]+)@([^@\s]+)$/u.exec(spec.trim());
  return match?.[1] === undefined || match[2] === undefined
    ? undefined
    : { plugin: match[1], marketplace: normalizeName(match[2]) };
}

function resolveLocalPath(value: string, cwd: string): string {
  const expanded = expandHome(value);
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

function expandHome(value: string): string {
  if (value === "~") {
    return homedir();
  }
  return value.startsWith(`~${sep}`) ? join(homedir(), value.slice(2)) : value;
}

function normalizeSubdir(value: string): string {
  return value.replace(/\\/gu, "/").replace(/^\.?\//u, "");
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "marketplace";
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//u.test(value);
}

function isGitLikeSource(value: string): boolean {
  return value.startsWith("git@") || value.endsWith(".git");
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

export class PluginMarketplaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginMarketplaceError";
  }
}
