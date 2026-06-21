import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { request } from "undici";
import { z } from "zod";

import type { ClaudePluginInstallSource } from "./plugin-installer.js";

const execFileAsync = promisify(execFile);

const marketplaceNameSchema = z.object({
  name: z.string().min(1),
}).passthrough();

export type MarketplaceLocation = {
  readonly url: string;
  readonly ref?: string | undefined;
};

export type MarketplaceSourceRecord = MarketplaceLocation & {
  readonly name: string;
};

export async function resolveMarketplaceSource(source: string, cwd: string): Promise<MarketplaceSourceRecord> {
  const location = await marketplaceLocationForSource(source, cwd);
  const raw = await readMarketplaceText(location, cwd);
  const parsedJson: unknown = JSON.parse(raw);
  const parsed = marketplaceNameSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new PluginMarketplaceSourceError(`Invalid marketplace source ${source}: ${parsed.error.message}`);
  }
  return { name: normalizeName(parsed.data.name), ...location };
}

export async function marketplaceLocationForSource(source: string, cwd: string): Promise<MarketplaceLocation> {
  const github = githubLocationFromSource(source);
  if (github !== undefined) {
    return github;
  }
  const git = gitLocationFromSource(source);
  if (git !== undefined) {
    return git;
  }
  if (isHttpUrl(source)) {
    return { url: source };
  }
  return localMarketplaceLocation(source, cwd);
}

export async function readMarketplaceText(location: MarketplaceLocation, cwd: string): Promise<string> {
  if (isGitLikeSource(location.url)) {
    return readGitMarketplaceText(location);
  }
  if (isHttpUrl(location.url)) {
    return readHttpText(location.url);
  }
  return readFile(resolveLocalPath(location.url, cwd), "utf8");
}

export function gitSourceFromMarketplace(
  location: MarketplaceLocation,
  source: string,
): Omit<ClaudePluginInstallSource, "label"> | undefined {
  if (!isGitLikeSource(location.url)) {
    return undefined;
  }
  return {
    location: location.url,
    ...(location.ref === undefined ? {} : { ref: location.ref }),
    subdir: normalizeSubdir(source),
  };
}

async function localMarketplaceLocation(source: string, cwd: string): Promise<MarketplaceLocation> {
  const path = resolveLocalPath(source, cwd);
  const info = await stat(path);
  return { url: info.isDirectory() ? join(path, ".claude-plugin", "marketplace.json") : path };
}

function githubLocationFromSource(source: string): MarketplaceLocation | undefined {
  const shorthand = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:@([^#\s]+))?$/u.exec(source);
  if (shorthand?.[1] !== undefined && shorthand[2] !== undefined) {
    return githubLocation(shorthand[1], shorthand[2], shorthand[3]);
  }

  if (!source.startsWith("https://github.com/")) {
    return undefined;
  }
  const parsed = new URL(source);
  const parts = parsed.pathname.replace(/^\/|\/$/gu, "").split("/");
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/u, "");
  if (owner === undefined || repo === undefined) {
    return undefined;
  }
  return githubLocation(owner, repo, parsed.hash === "" ? undefined : parsed.hash.slice(1));
}

function githubLocation(owner: string, repo: string, ref: string | undefined): MarketplaceLocation {
  return {
    url: `https://github.com/${owner}/${repo}.git`,
    ...(ref === undefined ? {} : { ref }),
  };
}

function gitLocationFromSource(source: string): MarketplaceLocation | undefined {
  if (!isGitLikeSource(source)) {
    return undefined;
  }
  const [url, ref] = source.split("#", 2);
  if (url === undefined || url === "") {
    return undefined;
  }
  return { url, ...(ref === undefined || ref === "" ? {} : { ref }) };
}

async function readGitMarketplaceText(location: MarketplaceLocation): Promise<string> {
  const tempRoot = await mkdtemp(join(tmpdir(), "dream-marketplace-"));
  const checkoutRoot = join(tempRoot, "source");
  try {
    const args = location.ref === undefined
      ? ["clone", "--depth", "1", location.url, checkoutRoot]
      : ["clone", "--depth", "1", "--branch", location.ref, location.url, checkoutRoot];
    await execFileAsync("git", args);
    return readFile(join(checkoutRoot, ".claude-plugin", "marketplace.json"), "utf8");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function readHttpText(url: string): Promise<string> {
  const response = await request(url, { method: "GET", headersTimeout: 8_000, bodyTimeout: 12_000 });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new PluginMarketplaceSourceError(`Marketplace request failed: HTTP ${response.statusCode}`);
  }
  return response.body.text();
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
  return value.startsWith("git@") || value.endsWith(".git") || /\.git#/u.test(value);
}

export class PluginMarketplaceSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginMarketplaceSourceError";
  }
}
