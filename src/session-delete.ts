import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { sessionIndexPath } from "./session-layout.js";
import { parseJsonLine, sessionIndexEntrySchema, type SessionIndexEntry } from "./session-store-schema.js";

export async function deleteSession(root: string, sessionId: string): Promise<boolean> {
  const records = await readIndexRecords(root);
  const deleted = records.filter((record) => record.entry.sessionId === sessionId);
  if (deleted.length === 0) {
    return false;
  }

  const keptLines = records
    .filter((record) => record.entry.sessionId !== sessionId)
    .map((record) => record.line);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(sessionIndexPath(root), keptLines.length === 0 ? "" : `${keptLines.join("\n")}\n`, "utf8");
  await Promise.all(deleted.map((record) => rm(record.entry.sessionDir, { recursive: true, force: true })));
  return true;
}

type IndexRecord = {
  readonly entry: SessionIndexEntry;
  readonly line: string;
};

async function readIndexRecords(root: string): Promise<readonly IndexRecord[]> {
  const filePath = sessionIndexPath(root);
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return [];
    }
    throw error;
  }

  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ entry: parseJsonLine(sessionIndexEntrySchema, filePath, line), line }));
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrno(error: unknown, code: string): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string" && error.code === code;
}
