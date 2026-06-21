import { appendFile, copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export type FileCheckpoint = {
  readonly id: string;
  readonly createdAt: string;
  readonly path: string;
  readonly workspaceRoot: string;
  readonly snapshotPath: string;
};

type FileCheckpointRecord = FileCheckpoint & {
  readonly version: 1;
};

type ErrnoException = Error & {
  readonly code?: string;
};

export async function saveFileCheckpoint(
  inputPath: string,
  workspaceRoot = process.cwd(),
  configRoot: string,
): Promise<FileCheckpoint | undefined> {
  const absolutePath = resolveWorkspacePath(inputPath, workspaceRoot);
  const info = await optionalStat(absolutePath);
  if (info === undefined || !info.isFile()) {
    return undefined;
  }

  const createdAt = new Date().toISOString();
  const relativePath = relative(resolve(workspaceRoot), absolutePath) || ".";
  const id = `${createdAt.replace(/[^0-9A-Za-z]/gu, "")}_${Math.random().toString(36).slice(2, 8)}`;
  const historyRoot = join(configRoot, "file-history");
  const checkpointRoot = join(historyRoot, encodePath(relativePath));
  const snapshotPath = join(checkpointRoot, `${id}.snapshot`);
  const record: FileCheckpointRecord = {
    version: 1,
    id,
    createdAt,
    path: relativePath,
    workspaceRoot: resolve(workspaceRoot),
    snapshotPath,
  };

  await mkdir(checkpointRoot, { recursive: true, mode: 0o700 });
  await writeFile(snapshotPath, await readFile(absolutePath));
  await writeFile(join(checkpointRoot, `${id}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await appendFile(join(historyRoot, "index.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

export async function restoreLatestFileCheckpoint(
  inputPath: string,
  workspaceRoot = process.cwd(),
  configRoot: string,
): Promise<string> {
  const absolutePath = resolveWorkspacePath(inputPath, workspaceRoot);
  const relativePath = relative(resolve(workspaceRoot), absolutePath) || ".";
  const checkpointRoot = join(configRoot, "file-history", encodePath(relativePath));
  const records = await readCheckpointRecords(checkpointRoot);
  const latest = [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (latest === undefined) {
    throw new Error(`No file history found for ${relativePath}`);
  }

  await mkdir(dirname(absolutePath), { recursive: true });
  await copyFile(latest.snapshotPath, absolutePath);
  return absolutePath;
}

async function readCheckpointRecords(checkpointRoot: string): Promise<readonly FileCheckpointRecord[]> {
  let entries = [];
  try {
    entries = await readdir(checkpointRoot, { withFileTypes: true });
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const records: FileCheckpointRecord[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      records.push(JSON.parse(await readFile(join(checkpointRoot, entry.name), "utf8")) as FileCheckpointRecord);
    }
  }
  return records;
}

async function optionalStat(path: string): Promise<import("node:fs").Stats | undefined> {
  try {
    return await stat(path);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function resolveWorkspacePath(inputPath: string, rootInput: string): string {
  const root = resolve(rootInput);
  const absolutePath = resolve(root, inputPath);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
    throw new Error(`Path outside workspace blocked: ${inputPath}`);
  }
  return absolutePath;
}

function encodePath(path: string): string {
  return Buffer.from(path).toString("base64url");
}

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error;
}
