import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { cwd } from "node:process";
import { z } from "zod";

import { defaultConfigRoot } from "./config.js";

const sessionRoleSchema = z.enum(["user", "assistant"]);

const sessionTurnSchema = z.object({
  role: sessionRoleSchema,
  content: z.string(),
  createdAt: z.string(),
});

const dreamSessionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  directory: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  turns: z.array(sessionTurnSchema),
});

const sessionStoreSchema = z.object({
  version: z.literal(1),
  sessions: z.array(dreamSessionSchema),
});

export type SessionRole = z.infer<typeof sessionRoleSchema>;
export type SessionTurn = z.infer<typeof sessionTurnSchema>;
export type DreamSession = z.infer<typeof dreamSessionSchema>;
export type SessionStore = z.infer<typeof sessionStoreSchema>;

export class SessionStoreParseError extends Error {
  readonly filePath: string;

  constructor(filePath: string, reason: string) {
    super(`Could not parse Dream Code sessions at ${filePath}: ${reason}`);
    this.name = "SessionStoreParseError";
    this.filePath = filePath;
  }
}

export function sessionsFilePath(root = defaultConfigRoot()): string {
  return join(root, "sessions.json");
}

export async function loadSessionStore(root = defaultConfigRoot()): Promise<SessionStore> {
  const filePath = sessionsFilePath(root);
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return emptySessionStore();
    }
    throw error;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new SessionStoreParseError(filePath, error.message);
    }
    throw error;
  }

  const parsedStore = sessionStoreSchema.safeParse(parsedJson);
  if (!parsedStore.success) {
    throw new SessionStoreParseError(filePath, parsedStore.error.message);
  }
  return parsedStore.data;
}

export async function startSession(root = defaultConfigRoot(), directory = cwd()): Promise<DreamSession> {
  const store = await loadSessionStore(root);
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
  await saveSessionStore(root, { version: 1, sessions: [session, ...store.sessions] });
  return session;
}

export async function appendSessionTurn(
  root: string,
  sessionId: string,
  role: SessionRole,
  content: string,
): Promise<DreamSession | undefined> {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return findSession(await loadSessionStore(root), sessionId);
  }

  const store = await loadSessionStore(root);
  const now = new Date().toISOString();
  let updatedSession: DreamSession | undefined;
  const sessions = store.sessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }
    updatedSession = updatedDreamSession(session, role, trimmed, now);
    return updatedSession;
  });
  await saveSessionStore(root, { version: 1, sessions });
  return updatedSession;
}

export async function renameSession(root: string, sessionId: string, name: string): Promise<DreamSession | undefined> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const store = await loadSessionStore(root);
  const now = new Date().toISOString();
  let renamedSession: DreamSession | undefined;
  const sessions = store.sessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }
    renamedSession = { ...session, name: trimmed, summary: sentenceFromText(trimmed), updatedAt: now };
    return renamedSession;
  });
  await saveSessionStore(root, { version: 1, sessions });
  return renamedSession;
}

export async function listSessions(root = defaultConfigRoot()): Promise<readonly DreamSession[]> {
  const store = await loadSessionStore(root);
  return [...store.sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function saveSessionStore(root: string, store: SessionStore): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(sessionsFilePath(root), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function emptySessionStore(): SessionStore {
  return { version: 1, sessions: [] };
}

function updatedDreamSession(session: DreamSession, role: SessionRole, content: string, now: string): DreamSession {
  const summary = role === "user" ? sentenceFromText(content) : session.summary;
  return {
    ...session,
    summary,
    updatedAt: now,
    turns: [...session.turns, { role, content, createdAt: now }],
  };
}

function findSession(store: SessionStore, sessionId: string): DreamSession | undefined {
  return store.sessions.find((session) => session.id === sessionId);
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
