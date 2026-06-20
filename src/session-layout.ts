import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";

export function sessionIndexPath(root: string): string {
  return join(root, "session_index.jsonl");
}

export function sessionDirFor(root: string, sessionId: string, directory: string): string {
  return join(root, "sessions", workDirKey(directory), sessionId);
}

function workDirKey(directory: string): string {
  const normalized = resolve(directory);
  const name = basename(normalized).replace(/[^0-9A-Za-z._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "workspace";
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `${name}_${hash}`;
}
