import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

export type FileMentionKind = "file" | "directory";

export type FileMentionTarget = {
  readonly path: string;
  readonly kind: FileMentionKind;
  readonly description: string;
};

const execFileAsync = promisify(execFile);
const ignoredDirectories = new Set([".git", "node_modules", "dist", ".dream"]);
const maxScannedEntries = 2_000;

export async function discoverFileMentionTargets(cwd: string): Promise<readonly FileMentionTarget[]> {
  const gitPaths = await gitTrackedPaths(cwd);
  const filePaths = gitPaths ?? await scannedPaths(cwd);
  return targetsFromFiles(filePaths);
}

function targetsFromFiles(filePaths: readonly string[]): readonly FileMentionTarget[] {
  const fileTargets = filePaths
    .filter((path) => path.length > 0)
    .sort((left, right) => left.localeCompare(right))
    .map((path) => target(path, "file"));
  const directoryTargets = [...directoryPaths(filePaths)]
    .sort((left, right) => left.localeCompare(right))
    .map((path) => target(`${path}/`, "directory"));
  return [...directoryTargets, ...fileTargets];
}

function directoryPaths(filePaths: readonly string[]): ReadonlySet<string> {
  const directories = new Set<string>();
  for (const filePath of filePaths) {
    let current = dirname(filePath);
    while (current !== "." && current.length > 0) {
      directories.add(current);
      current = dirname(current);
    }
  }
  return directories;
}

function target(path: string, kind: FileMentionKind): FileMentionTarget {
  return {
    path,
    kind,
    description: kind === "directory" ? "directory listing" : basename(path),
  };
}

async function gitTrackedPaths(cwd: string): Promise<readonly string[] | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd });
    const paths = stdout.split(/\r?\n/u).filter((path) => path.length > 0);
    return paths.length === 0 ? undefined : paths;
  } catch (error: unknown) {
    if (error instanceof Error) {
      return undefined;
    }
    throw error;
  }
}

async function scannedPaths(cwd: string): Promise<readonly string[]> {
  const paths: string[] = [];
  await scanDirectory(cwd, "", paths);
  return paths;
}

async function scanDirectory(root: string, relativeDirectory: string, paths: string[]): Promise<void> {
  if (paths.length >= maxScannedEntries) {
    return;
  }
  const directory = relativeDirectory.length === 0 ? root : join(root, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (paths.length >= maxScannedEntries) {
      return;
    }
    const relativePath = relativeDirectory.length === 0 ? entry.name : join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        await scanDirectory(root, relativePath, paths);
      }
      continue;
    }
    if (entry.isFile()) {
      paths.push(relativePath);
    }
  }
}
