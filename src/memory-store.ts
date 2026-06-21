import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const maxMemorySectionChars = 2_000;

export type CheckpointInput = {
  readonly title: string;
  readonly body: string;
};

export function memoryRoot(root: string): string {
  return join(root, "memory");
}

export function memoryProjectRoot(root: string, directory: string): string {
  return join(memoryRoot(root), projectKey(directory));
}

export async function ensureProjectMemory(root: string, directory: string): Promise<string> {
  const projectRoot = memoryProjectRoot(root, directory);
  const filePath = join(projectRoot, "MEMORY.md");
  await mkdir(projectRoot, { recursive: true, mode: 0o700 });
  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    if (!isErrnoException(error) || error.code !== "ENOENT") {
      throw error;
    }
    await writeFile(filePath, initialMemory(directory), "utf8");
  }
  return filePath;
}

export async function writeCheckpoint(
  root: string,
  directory: string,
  sessionId: string,
  checkpoint: CheckpointInput,
): Promise<string> {
  await ensureProjectMemory(root, directory);
  const filePath = checkpointPath(root, directory, sessionId);
  await mkdir(join(memoryProjectRoot(root, directory), "sessions", sessionId), { recursive: true, mode: 0o700 });
  await writeFile(filePath, renderCheckpoint(checkpoint), "utf8");
  return filePath;
}

export async function appendTaskProgress(
  root: string,
  directory: string,
  taskId: string,
  note: string,
): Promise<string> {
  await ensureProjectMemory(root, directory);
  const filePath = taskProgressPath(root, directory, taskId);
  await mkdir(join(memoryProjectRoot(root, directory), "tasks", taskId), { recursive: true, mode: 0o700 });
  await appendFile(filePath, progressEntry(note), "utf8");
  return filePath;
}

export async function formatMemoryContext(root: string, directory: string, sessionId?: string): Promise<string> {
  await ensureProjectMemory(root, directory);
  const projectRoot = memoryProjectRoot(root, directory);
  const memory = await readOptional(join(projectRoot, "MEMORY.md"));
  const checkpoint = sessionId === undefined ? undefined : await readOptional(checkpointPath(root, directory, sessionId));
  const progress = await readRecentProgress(projectRoot);
  const sections = [
    memorySection("MEMORY.md", memory),
    memorySection("checkpoint.md", checkpoint),
    progress.length === 0 ? "task progress: none." : ["task progress:", ...progress].join("\n"),
  ];
  return ["Dream memory:", ...sections].join("\n");
}

export function checkpointPath(root: string, directory: string, sessionId: string): string {
  return join(memoryProjectRoot(root, directory), "sessions", sessionId, "checkpoint.md");
}

export function taskProgressPath(root: string, directory: string, taskId: string): string {
  return join(memoryProjectRoot(root, directory), "tasks", taskId, "progress.md");
}

function initialMemory(directory: string): string {
  return [
    "# Project Memory",
    "",
    `Workspace: ${resolve(directory)}`,
    "",
    "## Durable Notes",
    "- No durable notes recorded yet.",
    "",
  ].join("\n");
}

function renderCheckpoint(checkpoint: CheckpointInput): string {
  return [
    `# ${checkpoint.title}`,
    "",
    `Updated: ${new Date().toISOString()}`,
    "",
    checkpoint.body.trim(),
    "",
  ].join("\n");
}

function progressEntry(note: string): string {
  return [`## ${new Date().toISOString()}`, "", note.trim(), ""].join("\n");
}

async function readRecentProgress(projectRoot: string): Promise<readonly string[]> {
  const paths = await collectProgressPaths(join(projectRoot, "tasks"));
  const snippets = await Promise.all(paths.slice(-5).map(async (filePath) => {
    const content = await readOptional(filePath);
    return content === undefined ? undefined : `- ${trimSection(content)}`;
  }));
  return snippets.filter(isString);
}

async function collectProgressPaths(tasksRoot: string): Promise<readonly string[]> {
  try {
    const { readdir } = await import("node:fs/promises");
    const taskIds = await readdir(tasksRoot);
    return taskIds.map((taskId) => join(tasksRoot, taskId, "progress.md")).sort();
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

function memorySection(label: string, content: string | undefined): string {
  return content === undefined ? `${label}: none.` : `${label}:\n${trimSection(content)}`;
}

function trimSection(content: string): string {
  const normalized = content.trim();
  return normalized.length > maxMemorySectionChars ? `${normalized.slice(0, maxMemorySectionChars)}\n[Truncated memory]` : normalized;
}

function projectKey(directory: string): string {
  const normalized = resolve(directory);
  const name = basename(normalized).replace(/[^0-9A-Za-z._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "workspace";
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `${name}_${hash}`;
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
