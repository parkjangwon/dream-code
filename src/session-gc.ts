import { rm, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { z } from "zod";

import { sessionIndexPath } from "./session-layout.js";

const sessionIndexEntrySchema = z.object({
  sessionId: z.string().min(1),
  sessionDir: z.string().min(1),
  directory: z.string().min(1),
});

type SessionIndexEntry = z.infer<typeof sessionIndexEntrySchema>;
type ErrnoException = Error & { readonly code?: string };

export async function pruneEmptySessions(root: string): Promise<void> {
  const entries = await readIndexEntries(root);
  if (entries.length === 0) {
    return;
  }

  const kept: SessionIndexEntry[] = [];
  let pruned = false;
  for (const entry of entries) {
    if (await hasSessionTurns(entry.sessionDir)) {
      kept.push(entry);
      continue;
    }
    pruned = true;
    await removeSessionDir(root, entry.sessionDir);
  }

  if (pruned) {
    await writeIndexEntries(root, kept);
  }
}

async function readIndexEntries(root: string): Promise<readonly SessionIndexEntry[]> {
  const filePath = sessionIndexPath(root);
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => sessionIndexEntrySchema.parse(JSON.parse(line)));
}

async function hasSessionTurns(sessionDir: string): Promise<boolean> {
  let raw = "";
  try {
    raw = await readFile(resolve(sessionDir, "wire.jsonl"), "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
  return raw.split(/\r?\n/u).some((line) => line.trim().length > 0);
}

async function removeSessionDir(root: string, sessionDir: string): Promise<void> {
  if (!isSafeSessionDir(root, sessionDir)) {
    return;
  }
  await rm(sessionDir, { recursive: true, force: true });
}

function isSafeSessionDir(root: string, sessionDir: string): boolean {
  if (!isAbsolute(sessionDir)) {
    return false;
  }
  const sessionsRoot = `${resolve(root, "sessions")}${sep}`;
  return resolve(sessionDir).startsWith(sessionsRoot);
}

async function writeIndexEntries(root: string, entries: readonly SessionIndexEntry[]): Promise<void> {
  const body = entries.map((entry) => JSON.stringify(entry)).join("\n");
  await writeFile(sessionIndexPath(root), body.length === 0 ? "" : `${body}\n`, "utf8");
}

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error;
}
