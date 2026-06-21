import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { mcpConfigFilePath } from "./mcp-config.js";
import { deletePluginRecord, loadPluginRecords, type PluginRecord } from "./plugin-registry.js";

export type PluginUninstallResult =
  | {
    readonly kind: "removed";
    readonly record: PluginRecord;
    readonly removedSkills: number;
    readonly removedAgents: number;
    readonly removedMcpServers: number;
  }
  | { readonly kind: "missing"; readonly spec: string };

type ErrnoException = Error & { readonly code: string };

export async function uninstallPlugin(root: string, spec: string): Promise<PluginUninstallResult> {
  const record = await findPluginRecord(root, spec);
  if (record === undefined) {
    return { kind: "missing", spec: spec.trim() };
  }

  const pluginId = record.id;
  const [removedSkills, removedAgents, removedMcpServers] = await Promise.all([
    removePrefixedEntries(join(root, "skills"), pluginId),
    removePrefixedEntries(join(root, "agents"), pluginId),
    removeMcpServersByPrefix(root, `${pluginId}-`),
    rm(join(root, "plugins", pluginId), { recursive: true, force: true }),
  ]).then(([skills, agents, mcp]) => [skills, agents, mcp] as const);
  await deletePluginRecord(root, pluginId);
  return { kind: "removed", record, removedSkills, removedAgents, removedMcpServers };
}

async function findPluginRecord(root: string, spec: string): Promise<PluginRecord | undefined> {
  const normalized = slugify(spec);
  return (await loadPluginRecords(root)).find((record) => record.id === normalized || slugify(record.name) === normalized);
}

async function removePrefixedEntries(root: string, prefix: string): Promise<number> {
  const entries = await readDirOptional(root);
  let removed = 0;
  for (const entry of entries) {
    if (entry.name.startsWith(`${prefix}-`)) {
      await rm(join(root, entry.name), { recursive: true, force: true });
      removed += 1;
    }
  }
  return removed;
}

async function removeMcpServersByPrefix(root: string, prefix: string): Promise<number> {
  const filePath = mcpConfigFilePath(root);
  const raw = await readOptional(filePath);
  if (raw === undefined) {
    return 0;
  }

  const sections = splitMcpConfig(raw);
  const keptBlocks: string[] = [];
  let removed = 0;
  for (const block of sections.blocks) {
    const name = serverName(block);
    if (name?.startsWith(prefix) === true) {
      removed += 1;
      continue;
    }
    keptBlocks.push(block);
  }
  if (removed === 0) {
    return 0;
  }
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${sections.header}${keptBlocks.join("")}`, "utf8");
  return removed;
}

function splitMcpConfig(raw: string): { readonly header: string; readonly blocks: readonly string[] } {
  const firstBlock = raw.indexOf("[[server]]");
  if (firstBlock < 0) {
    return { header: raw, blocks: [] };
  }
  const header = raw.slice(0, firstBlock);
  const blocks = raw.slice(firstBlock).split(/(?=\[\[server\]\])/u).filter((block) => block.length > 0);
  return { header, blocks };
}

function serverName(block: string): string | undefined {
  return /^\s*name\s*=\s*"([^"]+)"/mu.exec(block)?.[1];
}

async function readDirOptional(root: string) {
  try {
    return await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "plugin";
}

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
