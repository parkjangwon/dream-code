import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";

import type { AgentToolRequest } from "./agent-tool-schema.js";
import { saveFileCheckpoint } from "./file-history.js";
import { resolveWorkspacePath } from "./workspace-tools.js";

type PatchRequest = Extract<AgentToolRequest, { readonly tool: "patch" }>;
type DiffRequest = Extract<AgentToolRequest, { readonly tool: "diff" }>;
type StatRequest = Extract<AgentToolRequest, { readonly tool: "stat" }>;
type MoveRequest = Extract<AgentToolRequest, { readonly tool: "move" }>;
type CopyRequest = Extract<AgentToolRequest, { readonly tool: "copy" }>;

export type WorkspaceToolPolicy = {
  readonly workspaceRoot: string;
  readonly configRoot: string;
  readonly signal?: AbortSignal;
};

export async function runPatchTool(request: PatchRequest, policy: WorkspaceToolPolicy): Promise<{ readonly output: string; readonly changedPath?: string }> {
  const files = parseUnifiedPatch(request.patch);
  const changed: string[] = [];
  const checkpoints: string[] = [];
  for (const file of files) {
    const result = await applyFilePatch(file, policy);
    changed.push(result.path);
    if (result.checkpoint !== undefined) {
      checkpoints.push(result.checkpoint);
    }
  }
  const firstChanged = changed[0];
  return {
    output: formatChanged("patched", changed, checkpoints),
    ...(firstChanged === undefined ? {} : { changedPath: firstChanged }),
  };
}

export async function runDiffTool(request: DiffRequest, policy: WorkspaceToolPolicy): Promise<string> {
  const path = request.path ?? ".";
  const git = await runGitDiff(path, policy);
  if (git.trim().length > 0) {
    return limit(git, request.maxChars ?? 12_000);
  }
  const filePath = resolveWorkspacePath(path, policy.workspaceRoot);
  const info = await stat(filePath);
  if (!info.isFile()) {
    return "no diff";
  }
  const content = await readFile(filePath, "utf8");
  return limit(`--- ${path}\n+++ ${path}\n${content}`, request.maxChars ?? 12_000);
}

export async function runStatTool(request: StatRequest, policy: WorkspaceToolPolicy): Promise<string> {
  const absolutePath = resolveWorkspacePath(request.path, policy.workspaceRoot);
  const info = await stat(absolutePath);
  const kind = info.isDirectory() ? "dir" : info.isFile() ? "file" : "other";
  return [
    `${kind} ${request.path}`,
    `path: ${absolutePath}`,
    `size: ${info.size}`,
    `modified: ${info.mtime.toISOString()}`,
  ].join("\n");
}

export async function runMoveTool(request: MoveRequest, policy: WorkspaceToolPolicy): Promise<{ readonly output: string; readonly changedPath: string }> {
  const from = resolveWorkspacePath(request.from, policy.workspaceRoot);
  const to = resolveWorkspacePath(request.to, policy.workspaceRoot);
  await ensureDestinationAllowed(request.to, request.overwrite, policy);
  const checkpoints = await checkpointsFor([request.from, request.to], policy);
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
  return { output: formatChanged(`moved ${request.from} ->`, [to], checkpoints), changedPath: to };
}

export async function runCopyTool(request: CopyRequest, policy: WorkspaceToolPolicy): Promise<{ readonly output: string; readonly changedPath: string }> {
  const from = resolveWorkspacePath(request.from, policy.workspaceRoot);
  const to = resolveWorkspacePath(request.to, policy.workspaceRoot);
  await ensureDestinationAllowed(request.to, request.overwrite, policy);
  const checkpoints = await checkpointsFor([request.to], policy);
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  return { output: formatChanged(`copied ${request.from} ->`, [to], checkpoints), changedPath: to };
}

type FilePatch = {
  readonly path: string;
  readonly hunks: readonly Hunk[];
};

type Hunk = {
  readonly oldStart: number;
  readonly lines: readonly string[];
};

function parseUnifiedPatch(patch: string): readonly FilePatch[] {
  const lines = patch.replace(/\r\n/gu, "\n").split("\n");
  const files: FilePatch[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index]?.startsWith("--- ")) {
      index += 1;
      continue;
    }
    index += 1;
    const nextPath = lines[index];
    if (nextPath === undefined || !nextPath.startsWith("+++ ")) {
      throw new Error("Invalid patch: missing +++ file header");
    }
    const filePath = normalizePatchPath(nextPath.slice(4).trim());
    index += 1;
    const hunks: Hunk[] = [];
    while (index < lines.length && !lines[index]?.startsWith("--- ")) {
      const header = lines[index] ?? "";
      if (!header.startsWith("@@ ")) {
        index += 1;
        continue;
      }
      const oldStart = parseHunkStart(header);
      index += 1;
      const hunkLines: string[] = [];
      while (index < lines.length && !lines[index]?.startsWith("@@ ") && !lines[index]?.startsWith("--- ")) {
        const line = lines[index] ?? "";
        if (line.length > 0 && (line[0] === " " || line[0] === "-" || line[0] === "+")) {
          hunkLines.push(line);
        }
        index += 1;
      }
      hunks.push({ oldStart, lines: hunkLines });
    }
    files.push({ path: filePath, hunks });
  }
  if (files.length === 0) {
    throw new Error("Invalid patch: no file hunks found");
  }
  return files;
}

async function applyFilePatch(file: FilePatch, policy: WorkspaceToolPolicy): Promise<{ readonly path: string; readonly checkpoint?: string }> {
  const absolutePath = resolveWorkspacePath(file.path, policy.workspaceRoot);
  const checkpoint = await saveFileCheckpoint(file.path, policy.workspaceRoot, policy.configRoot);
  const content = await readOptionalText(absolutePath);
  const source = splitPatchLines(content ?? "");
  const next = applyHunks(source, file.hunks, file.path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${next.join("\n")}\n`, "utf8");
  return { path: absolutePath, ...(checkpoint === undefined ? {} : { checkpoint: checkpoint.snapshotPath }) };
}

function applyHunks(source: readonly string[], hunks: readonly Hunk[], path: string): readonly string[] {
  const output: string[] = [];
  let cursor = 0;
  for (const hunk of hunks) {
    const target = Math.max(0, hunk.oldStart - 1);
    output.push(...source.slice(cursor, target));
    cursor = target;
    for (const line of hunk.lines) {
      const marker = line[0];
      const text = line.slice(1);
      if (marker === " " || marker === "-") {
        if (source[cursor] !== text) {
          throw new Error(`Patch context mismatch in ${path}: expected "${text}"`);
        }
        if (marker === " ") {
          output.push(text);
        }
        cursor += 1;
      } else if (marker === "+") {
        output.push(text);
      }
    }
  }
  output.push(...source.slice(cursor));
  return output;
}

function splitPatchLines(content: string): readonly string[] {
  const normalized = content.replace(/\r\n/gu, "\n");
  return normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");
}

async function ensureDestinationAllowed(path: string, overwrite: boolean | undefined, policy: WorkspaceToolPolicy): Promise<void> {
  if (overwrite === true) {
    return;
  }
  try {
    await stat(resolveWorkspacePath(path, policy.workspaceRoot));
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error(`Destination exists: ${path}`);
}

async function checkpointsFor(paths: readonly string[], policy: WorkspaceToolPolicy): Promise<readonly string[]> {
  const checkpoints = await Promise.all(paths.map((path) => saveFileCheckpoint(path, policy.workspaceRoot, policy.configRoot)));
  return checkpoints.map((checkpoint) => checkpoint?.snapshotPath).filter(isString);
}

function runGitDiff(path: string, policy: WorkspaceToolPolicy): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("git", ["diff", "--", path], { cwd: policy.workspaceRoot, stdio: ["ignore", "pipe", "pipe"], signal: policy.signal });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`;
    });
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(output));
  });
}

async function readOptionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function parseHunkStart(header: string): number {
  const match = /^@@ -(?<start>\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/u.exec(header);
  const start = match?.groups?.["start"];
  if (start === undefined) {
    throw new Error(`Invalid patch hunk header: ${header}`);
  }
  return Number.parseInt(start, 10);
}

function normalizePatchPath(path: string): string {
  if (path.startsWith("b/") || path.startsWith("a/")) {
    return path.slice(2);
  }
  return path;
}

function formatChanged(verb: string, paths: readonly string[], checkpoints: readonly string[]): string {
  return [
    `${verb} ${paths.map((path) => relative(process.cwd(), path)).join(", ")}`,
    ...checkpoints.map((checkpoint) => `checkpoint: ${checkpoint}`),
  ].join("\n");
}

function limit(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[truncated]` : text;
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}

type ErrnoException = Error & {
  readonly code?: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error;
}
