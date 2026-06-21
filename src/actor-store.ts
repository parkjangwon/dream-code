import { mkdir, readFile, writeFile } from "node:fs/promises";

import {
  actorIndexPath,
  actorsRoot,
  parseActorRecord,
  type ActorRecord,
  type ActorStatus,
  type ActorStatusUpdate,
  type RegisterActorInput,
} from "./actor-record.js";

export async function registerActor(root: string, input: RegisterActorInput): Promise<ActorRecord> {
  const now = new Date().toISOString();
  const record: ActorRecord = {
    version: 1,
    id: input.id ?? actorId(input.name),
    role: input.role,
    name: input.name,
    task: input.task,
    status: "running",
    startedAt: now,
    updatedAt: now,
    ...optionalActorFields(input),
  };
  await saveActors(root, upsertActor(await readActors(root), record));
  return record;
}

export async function updateActorStatus(
  root: string,
  actorIdValue: string,
  status: ActorStatus,
  update: ActorStatusUpdate = {},
): Promise<ActorRecord | undefined> {
  const actors = await readActors(root);
  const now = new Date().toISOString();
  let updated: ActorRecord | undefined;
  const next = actors.map((actor) => {
    if (actor.id !== actorIdValue) {
      return actor;
    }
    updated = {
      ...actor,
      status,
      updatedAt: now,
      ...(isTerminalStatus(status) ? { endedAt: now } : {}),
      ...(update.summary === undefined ? {} : { summary: update.summary }),
      ...(update.error === undefined ? {} : { error: update.error }),
    };
    return updated;
  });
  if (updated !== undefined) {
    await saveActors(root, next);
  }
  return updated;
}

export async function listActors(root: string, limit = 50): Promise<readonly ActorRecord[]> {
  return [...await readActors(root)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}

async function readActors(root: string): Promise<readonly ActorRecord[]> {
  try {
    const parsedJson: unknown = JSON.parse(await readFile(actorIndexPath(root), "utf8"));
    return Array.isArray(parsedJson) ? parsedJson.map(parseActorRecord).filter(isActorRecord) : [];
  } catch (error) {
    if (error instanceof SyntaxError || (isErrnoException(error) && error.code === "ENOENT")) {
      return [];
    }
    throw error;
  }
}

async function saveActors(root: string, actors: readonly ActorRecord[]): Promise<void> {
  await mkdir(actorsRoot(root), { recursive: true, mode: 0o700 });
  await writeFile(actorIndexPath(root), `${JSON.stringify(actors, null, 2)}\n`, "utf8");
}

function upsertActor(actors: readonly ActorRecord[], record: ActorRecord): readonly ActorRecord[] {
  const withoutRecord = actors.filter((actor) => actor.id !== record.id);
  return [...withoutRecord, record];
}

function optionalActorFields(input: RegisterActorInput): Partial<ActorRecord> {
  return {
    ...(input.parentActorId === undefined ? {} : { parentActorId: input.parentActorId }),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
  };
}

function actorId(name: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.]/gu, "");
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-|-$/gu, "") || "actor";
  return `${timestamp}_${slug}_${Math.random().toString(36).slice(2, 8)}`;
}

function isTerminalStatus(status: ActorStatus): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}

function isActorRecord(value: ActorRecord | undefined): value is ActorRecord {
  return value !== undefined;
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
