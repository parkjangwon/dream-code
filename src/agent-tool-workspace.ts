import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";

import type { AgentToolRequest } from "./agent-tool-schema.js";
import { applyHunks, parseUnifiedPatch, splitPatchLines, type FilePatch } from "./agent-tool-patch.js";
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
