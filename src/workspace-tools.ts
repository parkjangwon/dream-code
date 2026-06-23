import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export type ReadFileResult = {
  readonly path: string;
  readonly content: string;
  readonly truncated: boolean;
  readonly bytes: number;
};

export type EditFileResult = {
  readonly path: string;
  readonly replaced: boolean;
  readonly replacements: number;
  readonly message?: string;
};

export type WorkspaceSearchResult = {
  readonly path: string;
  readonly line: number;
  readonly text: string;
};

export type ReadWorkspaceFileOptions = {
  readonly maxChars?: number;
  readonly startLine?: number;
  readonly endLine?: number;
};

export type ReplaceInFileOptions = {
  readonly replaceAll?: boolean;
  readonly expectedReplacements?: number;
};

export async function readWorkspaceFile(
  inputPath: string,
  optionsOrMaxChars: ReadWorkspaceFileOptions | number = 8_000,
  workspaceRoot = process.cwd(),
): Promise<ReadFileResult> {
  const absolutePath = resolveWorkspacePath(inputPath, workspaceRoot);
  const content = await readFile(absolutePath, "utf8");
  const options = typeof optionsOrMaxChars === "number" ? { maxChars: optionsOrMaxChars } : optionsOrMaxChars;
  const ranged = sliceLineRange(content, options.startLine, options.endLine);
  const maxChars = options.maxChars ?? 8_000;
  const truncated = ranged.length > maxChars;

  return {
    path: absolutePath,
    content: truncated ? ranged.slice(0, maxChars) : ranged,
    truncated,
    bytes: Buffer.byteLength(content),
  };
}

export async function listWorkspacePath(inputPath = ".", workspaceRoot = process.cwd()): Promise<string> {
  const absolutePath = resolveWorkspacePath(inputPath, workspaceRoot);
  const entries = await readdir(absolutePath, { withFileTypes: true });
  return entries
    .filter((entry) => !ignoredEntry(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 120)
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`)
    .join("\n");
}

export async function searchWorkspaceText(
  query: string,
  inputPath = ".",
  workspaceRoot = process.cwd(),
): Promise<readonly WorkspaceSearchResult[]> {
  const root = resolveWorkspacePath(inputPath, workspaceRoot);
  const files = await collectTextFiles(root, 160);
  const results: WorkspaceSearchResult[] = [];
  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/u);
    for (let index = 0; index < lines.length && results.length < 50; index += 1) {
      const line = lines[index] ?? "";
      if (line.includes(query)) {
        results.push({ path: filePath, line: index + 1, text: line.trim().slice(0, 240) });
      }
    }
  }
  return results;
}

export async function writeWorkspaceFile(inputPath: string, content: string, workspaceRoot = process.cwd()): Promise<string> {
  const absolutePath = resolveWorkspacePath(inputPath, workspaceRoot);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
  return absolutePath;
}

export async function mkdirWorkspacePath(inputPath: string, workspaceRoot = process.cwd()): Promise<string> {
  const absolutePath = resolveWorkspacePath(inputPath, workspaceRoot);
  await mkdir(absolutePath, { recursive: true });
  return absolutePath;
}

export async function deleteWorkspacePath(inputPath: string, workspaceRoot = process.cwd()): Promise<string> {
  const absolutePath = resolveWorkspacePath(inputPath, workspaceRoot);
  await rm(absolutePath, { recursive: true, force: true });
  return absolutePath;
}

export async function replaceInWorkspaceFile(
  inputPath: string,
  searchText: string,
  replacementText: string,
  options: ReplaceInFileOptions = {},
  workspaceRoot = process.cwd(),
): Promise<EditFileResult> {
  const absolutePath = resolveWorkspacePath(inputPath, workspaceRoot);
  const content = await readFile(absolutePath, "utf8");
  const replacements = countOccurrences(content, searchText);
  if (options.expectedReplacements !== undefined && replacements !== options.expectedReplacements) {
    return {
      path: absolutePath,
      replaced: false,
      replacements,
      message: `expected ${options.expectedReplacements} replacements but found ${replacements}`,
    };
  }
  if (replacements === 0) {
    return { path: absolutePath, replaced: false, replacements };
  }

  const next = options.replaceAll === true
    ? content.split(searchText).join(replacementText)
    : content.replace(searchText, replacementText);
  await writeFile(absolutePath, next, "utf8");
  return { path: absolutePath, replaced: true, replacements: options.replaceAll === true ? replacements : 1 };
}

export function runShellCommand(command: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: "inherit" });

    child.once("error", (error) => {
      reject(error);
    });
    child.once("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

export function resolveWorkspacePath(inputPath: string, rootInput: string): string {
  const root = resolve(rootInput);
  const absolutePath = resolve(root, inputPath);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
    throw new Error(`Path outside workspace blocked: ${inputPath}`);
  }
  return absolutePath;
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
      files.push(...await collectTextFiles(path, limit - files.length));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function ignoredEntry(name: string): boolean {
  return name === ".git" || name === "node_modules" || name === "dist" || name === ".dream";
}

function textLike(name: string): boolean {
  return /\.(?:[cm]?[jt]sx?|json|md|txt|toml|ya?ml|css|html|java|py|go|rs|sh)$/u.test(name);
}

function sliceLineRange(content: string, startLine: number | undefined, endLine: number | undefined): string {
  if (startLine === undefined && endLine === undefined) {
    return content;
  }
  const lines = content.split(/\r?\n/u);
  const start = Math.max(1, startLine ?? 1);
  const end = Math.min(lines.length, endLine ?? lines.length);
  if (start > end) {
    return "";
  }
  return lines.slice(start - 1, end).join("\n");
}

function countOccurrences(content: string, needle: string): number {
  return content.split(needle).length - 1;
}
