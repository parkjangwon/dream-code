import { stat } from "node:fs/promises";
import { resolve } from "node:path";

import { loadWorkspaceDirs } from "./workspace-state.js";
import { listSessions } from "./session-store.js";

export type RemoteProject = {
  readonly id: string;
  readonly name: string;
  readonly path: string;
};

export async function listRemoteProjects(root: string, currentDirectory: string): Promise<readonly RemoteProject[]> {
  const [workspaceDirs, sessions] = await Promise.all([loadWorkspaceDirs(root), listSessions(root)]);
  const sessionDirs = sessions.map((session) => session.directory);
  const candidates = uniquePaths([currentDirectory, ...workspaceDirs, ...sessionDirs]);
  const existing = await Promise.all(candidates.map(async (candidate) => {
    return await isDirectory(candidate) ? projectDto(candidate) : undefined;
  }));
  return existing.filter((project): project is RemoteProject => project !== undefined);
}

function uniquePaths(paths: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const normalized = resolve(path);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

function projectDto(path: string): RemoteProject {
  const parts = path.split(/[\\/]/u).filter((part) => part.length > 0);
  return { id: Buffer.from(path).toString("base64url"), name: parts.at(-1) ?? path, path };
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrno(error: unknown, code: string): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string" && error.code === code;
}
