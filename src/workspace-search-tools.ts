import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { resolveWorkspacePath, type WorkspaceSearchResult } from "./workspace-tools.js";

export type GrepWorkspaceOptions = {
  readonly query: string;
  readonly path?: string;
  readonly regex?: boolean;
  readonly glob?: string;
  readonly caseSensitive?: boolean;
  readonly contextLines?: number;
};

const execFileAsync = promisify(execFile);

export async function grepWorkspaceText(
  options: GrepWorkspaceOptions,
  workspaceRoot = process.cwd(),
): Promise<readonly WorkspaceSearchResult[]> {
  const inputPath = options.path ?? ".";
  const root = resolveWorkspacePath(inputPath, workspaceRoot);
  const files = options.glob === undefined
    ? await collectTextFiles(root, 160)
    : (await globWorkspaceFiles(options.glob, inputPath, workspaceRoot, 160)).map((path) => resolveWorkspacePath(path, workspaceRoot));
  const results: WorkspaceSearchResult[] = [];
  const matcher = createLineMatcher(options.query, options.regex === true, options.caseSensitive !== false);
  const contextLines = options.contextLines ?? 0;
  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/u);
    for (let index = 0; index < lines.length && results.length < 50; index += 1) {
      const line = lines[index] ?? "";
      if (matcher(line)) {
        pushMatchWithContext(results, filePath, lines, index, contextLines);
      }
    }
  }
  return results;
}

export async function globWorkspaceFiles(
  pattern: string,
  inputPath = ".",
  workspaceRoot = process.cwd(),
  maxResults = 200,
): Promise<readonly string[]> {
  const scopeRoot = resolveWorkspacePath(inputPath, workspaceRoot);
  const workspaceAbsolute = resolve(workspaceRoot);
  const scopePrefix = normalizePath(relative(workspaceAbsolute, scopeRoot));
  const gitFiles = await gitListFiles(workspaceRoot);
  const candidates = gitFiles ?? (await collectFiles(resolveWorkspacePath(inputPath, workspaceRoot), maxResults))
    .map((path) => normalizePath(relative(workspaceAbsolute, path)));
  const regex = globToRegExp(normalizePath(pattern));
  return candidates
    .filter((path) => pathInScope(path, scopePrefix))
    .filter((path) => regex.test(scopeRelativePath(path, scopePrefix)) || regex.test(path))
    .slice(0, maxResults);
}

async function collectTextFiles(root: string, limit: number): Promise<readonly string[]> {
  const files = await collectFiles(root, limit);
  return files.filter((path) => textLike(path));
}

async function collectFiles(root: string, limit: number): Promise<readonly string[]> {
  const info = await stat(root);
  if (info.isFile()) {
    return [root];
  }
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (files.length >= limit || ignoredEntry(entry.name)) {
      continue;
    }
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path, limit - files.length));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function createLineMatcher(query: string, regex: boolean, caseSensitive: boolean): (line: string) => boolean {
  if (regex) {
    const expression = new RegExp(query, caseSensitive ? "u" : "iu");
    return (line) => expression.test(line);
  }
  const needle = caseSensitive ? query : query.toLowerCase();
  return (line) => (caseSensitive ? line : line.toLowerCase()).includes(needle);
}

function pushMatchWithContext(
  results: WorkspaceSearchResult[],
  filePath: string,
  lines: readonly string[],
  index: number,
  contextLines: number,
): void {
  const start = Math.max(0, index - contextLines);
  const end = Math.min(lines.length - 1, index + contextLines);
  for (let lineIndex = start; lineIndex <= end && results.length < 50; lineIndex += 1) {
    const text = lines[lineIndex] ?? "";
    const key = `${filePath}:${lineIndex + 1}`;
    if (!results.some((result) => `${result.path}:${result.line}` === key)) {
      results.push({ path: filePath, line: lineIndex + 1, text: text.trim().slice(0, 240) });
    }
  }
}

async function gitListFiles(workspaceRoot: string): Promise<readonly string[] | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", workspaceRoot, "ls-files", "--cached", "--others", "--exclude-standard"]);
    return stdout.split(/\r?\n/u).map(normalizePath).filter((path) => path.length > 0);
  } catch (error: unknown) {
    if (error instanceof Error) {
      return undefined;
    }
    throw error;
  }
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? "";
    if (pattern.slice(index, index + 3) === "**/") {
      source = `${source}(?:.*/)?`;
      index += 2;
    } else if (pattern.slice(index, index + 2) === "**") {
      source = `${source}.*`;
      index += 1;
    } else if (char === "*") {
      source = `${source}[^/]*`;
    } else if (char === "?") {
      source = `${source}[^/]`;
    } else {
      source = `${source}${escapeRegExp(char)}`;
    }
  }
  return new RegExp(`${source}$`, "u");
}

function ignoredEntry(name: string): boolean {
  return name === ".git" || name === "node_modules" || name === "dist" || name === ".dream";
}

function textLike(name: string): boolean {
  return /\.(?:[cm]?[jt]sx?|json|md|txt|toml|ya?ml|css|html|java|py|go|rs|sh)$/u.test(name);
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function pathInScope(path: string, scopePrefix: string): boolean {
  return scopePrefix === "" || path === scopePrefix || path.startsWith(`${scopePrefix}/`);
}

function scopeRelativePath(path: string, scopePrefix: string): string {
  return scopePrefix === "" ? path : path.slice(scopePrefix.length + 1);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
