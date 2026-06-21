import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { readClaudePluginManifest } from "./plugin-manifest.js";
import { importClaudeMcpConfig } from "./plugin-mcp-import.js";
import { type PluginRecord, savePluginRecord } from "./plugin-registry.js";

const execFileAsync = promisify(execFile);

export type PluginInstallResult = {
  readonly record: PluginRecord;
  readonly pluginRoot: string;
};

export type ClaudePluginInstallSource = {
  readonly location: string;
  readonly subdir?: string;
  readonly ref?: string;
  readonly label?: string;
};

export async function installClaudePlugin(
  configRoot: string,
  source: string,
  cwd: string,
): Promise<PluginInstallResult> {
  return installResolvedClaudePlugin(configRoot, { location: source }, cwd);
}

export async function installResolvedClaudePlugin(
  configRoot: string,
  source: ClaudePluginInstallSource,
  cwd: string,
): Promise<PluginInstallResult> {
  const tempRoot = await maybeCloneSource(source);
  const baseRoot = tempRoot === undefined ? resolveLocalSource(source.location, cwd) : join(tempRoot, "source");
  const sourceRoot = source.subdir === undefined ? baseRoot : resolveSubdir(baseRoot, source.subdir);
  try {
    const manifest = await readClaudePluginManifest(sourceRoot);
    const pluginId = slugify(manifest.name);
    const pluginRoot = join(configRoot, "plugins", pluginId);
    const installedSourceRoot = join(pluginRoot, "source");
    await rm(pluginRoot, { recursive: true, force: true });
    await mkdir(pluginRoot, { recursive: true, mode: 0o700 });
    await cp(sourceRoot, installedSourceRoot, { recursive: true });

    const skills = await importSkills(installedSourceRoot, configRoot, pluginId);
    const agents = await importAgents(installedSourceRoot, configRoot, pluginId);
    const commands = await importCommands(installedSourceRoot, configRoot, pluginId, manifest.name);
    const mcpServers = await importClaudeMcpConfig(installedSourceRoot, configRoot, pluginId);
    const installedAt = new Date().toISOString();
    const record: PluginRecord = {
      id: pluginId,
      name: manifest.name,
      ...(manifest.version === undefined ? {} : { version: manifest.version }),
      ...(manifest.description === undefined ? {} : { description: manifest.description }),
      source: source.label ?? source.location,
      installedAt,
      skills,
      agents,
      commands,
      mcpServers,
    };
    await savePluginRecord(configRoot, record);
    return { record, pluginRoot };
  } finally {
    if (tempRoot !== undefined) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

async function maybeCloneSource(source: ClaudePluginInstallSource): Promise<string | undefined> {
  if (!isGitSource(source.location)) {
    return undefined;
  }
  const tempRoot = await mkdtemp(join(tmpdir(), "dream-claude-plugin-"));
  const args = source.ref === undefined
    ? ["clone", "--depth", "1", source.location, join(tempRoot, "source")]
    : ["clone", "--depth", "1", "--branch", source.ref, source.location, join(tempRoot, "source")];
  await execFileAsync("git", args);
  return tempRoot;
}

function resolveSubdir(baseRoot: string, subdir: string): string {
  const resolved = resolve(baseRoot, subdir);
  if (resolved !== baseRoot && !resolved.startsWith(`${baseRoot}${sep}`)) {
    throw new PluginInstallError(`Plugin subdirectory escapes source root: ${subdir}`);
  }
  return resolved;
}

function resolveLocalSource(source: string, cwd: string): string {
  const expanded = expandHome(source);
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

function expandHome(source: string): string {
  if (source === "~") {
    return homedir();
  }
  return source.startsWith(`~${sep}`) ? join(homedir(), source.slice(2)) : source;
}

async function importSkills(sourceRoot: string, configRoot: string, pluginId: string): Promise<number> {
  const source = join(sourceRoot, "skills");
  const entries = await readDirOptional(source);
  let imported = 0;
  for (const entry of entries) {
    const name = slugify(stripExtension(entry.name));
    const target = join(configRoot, "skills", `${pluginId}-${name}`);
    const sourcePath = join(source, entry.name);
    if (entry.isDirectory()) {
      await rm(target, { recursive: true, force: true });
      await cp(sourcePath, target, { recursive: true });
      imported += 1;
    } else if (entry.isFile() && isMarkdown(entry.name)) {
      await rm(target, { recursive: true, force: true });
      await mkdir(target, { recursive: true, mode: 0o700 });
      await cp(sourcePath, join(target, "SKILL.md"));
      imported += 1;
    }
  }
  return imported;
}

async function importAgents(sourceRoot: string, configRoot: string, pluginId: string): Promise<number> {
  const files = await collectMarkdownFiles(join(sourceRoot, "agents"));
  let imported = 0;
  for (const filePath of files) {
    const name = slugify(stripExtension(relative(join(sourceRoot, "agents"), filePath)));
    await mkdir(join(configRoot, "agents"), { recursive: true, mode: 0o700 });
    await cp(filePath, join(configRoot, "agents", `${pluginId}-${name}.md`));
    imported += 1;
  }
  return imported;
}

async function importCommands(
  sourceRoot: string,
  configRoot: string,
  pluginId: string,
  pluginName: string,
): Promise<number> {
  const files = await collectMarkdownFiles(join(sourceRoot, "commands"));
  let imported = 0;
  for (const filePath of files) {
    const commandName = slugify(stripExtension(relative(join(sourceRoot, "commands"), filePath)));
    const target = join(configRoot, "skills", `${pluginId}-command-${commandName}`);
    const body = await readFile(filePath, "utf8");
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true, mode: 0o700 });
    await writeFile(join(target, "SKILL.md"), formatCommandSkill(pluginName, `${pluginId}-command-${commandName}`, commandName, body), "utf8");
    imported += 1;
  }
  return imported;
}

function formatCommandSkill(pluginName: string, skillName: string, commandName: string, body: string): string {
  return [
    "---",
    `name: ${skillName}`,
    `description: Imported Claude command /${commandName} from ${pluginName}.`,
    "---",
    "",
    `# Claude Command: /${commandName}`,
    "",
    `Imported from Claude plugin ${pluginName}.`,
    "",
    body.trim(),
    "",
  ].join("\n");
}

async function collectMarkdownFiles(root: string): Promise<readonly string[]> {
  const entries = await readDirOptional(root);
  const files: string[] = [];
  for (const entry of entries) {
    const filePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(filePath));
    } else if (entry.isFile() && isMarkdown(entry.name)) {
      files.push(filePath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
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

function isGitSource(source: string): boolean {
  return /^https?:\/\//u.test(source) || source.startsWith("git@") || source.endsWith(".git");
}

function isMarkdown(name: string): boolean {
  return extname(name).toLowerCase() === ".md";
}

function stripExtension(name: string): string {
  const normalized = name.split(sep).join("-");
  const extension = extname(normalized);
  return extension === "" ? basename(normalized) : normalized.slice(0, -extension.length);
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "plugin";
}

export class PluginInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginInstallError";
  }
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
