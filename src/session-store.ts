import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { cwd } from "node:process";

import { defaultConfigRoot } from "./config.js";
import { pruneEmptySessions } from "./session-gc.js";
import { sessionDirFor, sessionIndexPath as layoutSessionIndexPath } from "./session-layout.js";
import {
  parseJsonLine,
  parseJsonText,
  sessionIndexEntrySchema,
  sessionStateSchema,
  wireTurnSchema,
  type DreamSession,
  type SessionIndexEntry,
  type SessionRole,
  type SessionState,
  type SessionStore,
  type SessionTurn,
  type WireTurn,
} from "./session-store-schema.js";

export type { DreamSession, SessionRole, SessionStore, SessionTurn } from "./session-store-schema.js";
export { SessionStoreParseError } from "./session-store-schema.js";

export function sessionIndexPath(root = defaultConfigRoot()): string {
  return layoutSessionIndexPath(root);
}

export async function loadSessionStore(root = defaultConfigRoot()): Promise<SessionStore> {
  const entries = await readSessionIndex(root);
  const sessions: DreamSession[] = [];

  for (const entry of entries.values()) {
    const session = await readSessionFromEntry(entry);
    if (session !== undefined) {
      sessions.push(session);
    }
  }

  return { version: 1, sessions };
}

export async function startSession(root = defaultConfigRoot(), directory = cwd()): Promise<DreamSession> {
  await pruneEmptySessions(root);
  const now = new Date().toISOString();
  const session: DreamSession = {
    id: createSessionId(now),
    name: basename(directory) || "Dream Code",
    summary: "New Dream Code session.",
    directory,
    createdAt: now,
    updatedAt: now,
    turns: [],
  };
  const sessionDir = sessionDirFor(root, session.id, directory);

  await mkdir(sessionDir, { recursive: true, mode: 0o700 });
  await writeSessionState(sessionDir, session);
  await appendSessionIndexEntry(root, { sessionId: session.id, sessionDir, directory: resolve(directory) });
  return session;
}

export async function appendSessionTurn(
  root: string,
  sessionId: string,
  role: SessionRole,
  content: string,
): Promise<DreamSession | undefined> {
  const session = await findSession(root, sessionId);
  if (session === undefined) {
    return undefined;
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return session;
  }

  const now = new Date().toISOString();
  const next = updatedDreamSession(session, role, trimmed, now);
  const sessionDir = sessionDirFor(root, session.id, session.directory);

  await appendWireTurn(sessionDir, { type: "turn", role, content: trimmed, createdAt: now });
  await writeSessionState(sessionDir, next);
  return next;
}

export async function renameSession(root: string, sessionId: string, name: string): Promise<DreamSession | undefined> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const session = await findSession(root, sessionId);
  if (session === undefined) {
    return undefined;
  }

  const renamed: DreamSession = {
    ...session,
    name: trimmed,
    summary: sentenceFromText(trimmed),
    updatedAt: new Date().toISOString(),
  };
  await writeSessionState(sessionDirFor(root, session.id, session.directory), renamed);
  return renamed;
}

export async function clearSessionTurns(root: string, sessionId: string): Promise<DreamSession | undefined> {
  const session = await findSession(root, sessionId);
  if (session === undefined) {
    return undefined;
  }

  const cleared: DreamSession = {
    ...session,
    summary: "Session cleared.",
    updatedAt: new Date().toISOString(),
    turns: [],
  };
  const sessionDir = sessionDirFor(root, session.id, session.directory);
  await rm(join(sessionDir, "wire.jsonl"), { force: true });
  await writeSessionState(sessionDir, cleared);
  return cleared;
}

export async function listSessions(root = defaultConfigRoot()): Promise<readonly DreamSession[]> {
  const store = await loadSessionStore(root);
  return [...store.sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function appendSessionIndexEntry(root: string, entry: SessionIndexEntry): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await appendFile(sessionIndexPath(root), `${JSON.stringify(entry)}\n`, "utf8");
}

async function readSessionIndex(root: string): Promise<Map<string, SessionIndexEntry>> {
  const filePath = sessionIndexPath(root);
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return new Map();
    }
    throw error;
  }

  const entries = new Map<string, SessionIndexEntry>();
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const entry = parseJsonLine(sessionIndexEntrySchema, filePath, trimmed);
    if (isAbsolute(entry.sessionDir) && entry.sessionId === basename(entry.sessionDir)) {
      entries.set(entry.sessionId, entry);
    }
  }
  return entries;
}

async function readSessionFromEntry(entry: SessionIndexEntry): Promise<DreamSession | undefined> {
  let state: SessionState;
  try {
    state = await readSessionState(entry.sessionDir);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  const turns = await readWireTurns(entry.sessionDir);
  return { ...state, turns };
}

async function findSession(root: string, sessionId: string): Promise<DreamSession | undefined> {
  const entries = await readSessionIndex(root);
  const entry = entries.get(sessionId);
  return entry === undefined ? undefined : readSessionFromEntry(entry);
}

async function readSessionState(sessionDir: string): Promise<SessionState> {
  const filePath = join(sessionDir, "state.json");
  const parsed = parseJsonText(sessionStateSchema, filePath, await readFile(filePath, "utf8"));
  return parsed;
}

async function writeSessionState(sessionDir: string, session: DreamSession): Promise<void> {
  const state: SessionState = {
    id: session.id,
    name: session.name,
    summary: session.summary,
    directory: resolve(session.directory),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
  await mkdir(sessionDir, { recursive: true, mode: 0o700 });
  await writeFile(join(sessionDir, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function appendWireTurn(sessionDir: string, turn: WireTurn): Promise<void> {
  await mkdir(sessionDir, { recursive: true, mode: 0o700 });
  await appendFile(join(sessionDir, "wire.jsonl"), `${JSON.stringify(turn)}\n`, "utf8");
}

async function readWireTurns(sessionDir: string): Promise<SessionTurn[]> {
  const filePath = join(sessionDir, "wire.jsonl");
  let raw: string;

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
    .map((line) => {
      const parsed = parseJsonLine(wireTurnSchema, filePath, line);
      return { role: parsed.role, content: parsed.content, createdAt: parsed.createdAt };
    });
}

function updatedDreamSession(session: DreamSession, role: SessionRole, content: string, now: string): DreamSession {
  const summary = role === "user" ? sentenceFromText(content) : session.summary;
  return { ...session, summary, updatedAt: now, turns: [...session.turns, { role, content, createdAt: now }] };
}

function sentenceFromText(text: string): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  const withoutCommand = normalized.startsWith("/") ? normalized.slice(1) : normalized;
  const firstSentence = /.+?[.!?。！？](?:\s|$)/u.exec(withoutCommand)?.[0].trim() ?? withoutCommand;
  return firstSentence.length > 90 ? `${firstSentence.slice(0, 87)}...` : firstSentence;
}

function createSessionId(now: string): string {
  const safeTime = now.replace(/[^0-9A-Za-z]/gu, "");
  return `session_${safeTime}_${Math.random().toString(36).slice(2, 8)}`;
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
