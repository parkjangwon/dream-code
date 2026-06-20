import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { ansi, paint } from "./ansi.js";
import { defaultConfigRoot } from "./config.js";

export function workspaceFilePath(root = defaultConfigRoot()): string {
  return join(root, "workspace.toml");
}

export async function addWorkspaceDir(root: string, inputPath: string, cwd: string): Promise<string> {
  const trimmed = inputPath.trim();
  if (trimmed.length === 0) {
    return "add-dir skipped: no directory";
  }
  const directory = resolvePath(trimmed, cwd);
  const paths = await loadWorkspaceDirs(root);
  const next = [...new Set([...paths, directory])].sort((left, right) => left.localeCompare(right));
  await saveWorkspaceDirs(root, next);
  return `added workspace dir: ${directory}`;
}

export async function loadWorkspaceDirs(root: string): Promise<readonly string[]> {
  try {
    return parseWorkspaceToml(await readFile(workspaceFilePath(root), "utf8"));
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function formatArtifacts(root: string, cwd: string): Promise<string> {
  const files = await listArtifactFiles([join(root, "artifacts"), join(cwd, ".dream", "artifacts")]);
  return [
    paint("Artifacts", `${ansi.bold}${ansi.accent}`),
    ...(files.length === 0 ? [paint("No artifacts yet.", ansi.dim)] : files.map((file) => `${paint("•", ansi.guide)} ${paint(file, ansi.blue)}`)),
  ].join("\n");
}

export async function formatTasks(root: string): Promise<string> {
  const tasks = await readLines(join(root, "tasks.md"));
  return [
    paint("Tasks", `${ansi.bold}${ansi.accent}`),
    ...(tasks.length === 0 ? [paint("No tasks yet.", ansi.dim)] : tasks.map((task) => `${paint("•", ansi.guide)} ${task}`)),
  ].join("\n");
}

export async function formatSettingsFile(root: string, name: "mcp" | "hooks"): Promise<string> {
  const filePath = join(root, `${name}.toml`);
  const content = await readOptional(filePath);
  const title = name === "mcp" ? "MCP" : "Hooks";
  return [
    paint(title, `${ansi.bold}${ansi.accent}`),
    `${paint("config", ansi.muted)} ${paint(filePath, ansi.blue)}`,
    content === undefined ? paint("No settings yet.", ansi.dim) : content.trim(),
  ].join("\n");
}

async function saveWorkspaceDirs(root: string, paths: readonly string[]): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const values = paths.map((path) => `"${path.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"")}"`).join(", ");
  await writeFile(workspaceFilePath(root), `version = 1\npaths = [${values}]\n`, "utf8");
}

function parseWorkspaceToml(raw: string): readonly string[] {
  const match = /^paths\s*=\s*\[(.*)\]\s*$/mu.exec(raw);
  if (match?.[1] === undefined) {
    return [];
  }
  return [...match[1].matchAll(/"((?:\\"|\\\\|[^"])*)"/gu)].map((item) => item[1]?.replace(/\\"/gu, "\"").replace(/\\\\/gu, "\\") ?? "");
}

async function listArtifactFiles(directories: readonly string[]): Promise<readonly string[]> {
  const files: string[] = [];
  for (const directory of directories) {
    for (const fileName of await readDirNames(directory)) {
      files.push(join(directory, fileName));
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function readDirNames(directory: string): Promise<readonly string[]> {
  try {
    return await readdir(directory);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readLines(filePath: string): Promise<readonly string[]> {
  const content = await readOptional(filePath);
  return content === undefined ? [] : content.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
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

function resolvePath(path: string, cwd: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
