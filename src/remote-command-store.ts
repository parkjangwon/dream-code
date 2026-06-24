import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import type { RemoteCommandActivity, RemoteCommandRecord } from "./remote-command-broker.js";

const commandStatusSchema = z.union([
  z.literal("queued"),
  z.literal("running"),
  z.literal("done"),
  z.literal("failed"),
  z.literal("cancelled"),
]);

const commandRecordSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  cwd: z.string(),
  status: commandStatusSchema,
  output: z.string(),
  activity: z.array(z.object({
    at: z.string(),
    label: z.string(),
    detail: z.string().optional(),
  })).optional(),
  sessionId: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  cancelRequestedAt: z.string().optional(),
  durationMs: z.number().optional(),
});

const commandStoreSchema = z.object({
  commands: z.array(commandRecordSchema),
});

type StoredCommandRecord = z.infer<typeof commandRecordSchema>;

export function remoteCommandStorePath(root: string): string {
  return join(root, "webapp", "remote-commands.json");
}

export async function loadRemoteCommandRecords(root: string, now = new Date()): Promise<readonly RemoteCommandRecord[]> {
  try {
    const parsed = commandStoreSchema.parse(JSON.parse(await readFile(remoteCommandStorePath(root), "utf8")));
    return parsed.commands.map((command) => normalizeRestoredCommand(toRemoteCommandRecord(command), now)).slice(0, 50);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function saveRemoteCommandRecords(root: string, commands: readonly RemoteCommandRecord[]): Promise<void> {
  await mkdir(join(root, "webapp"), { recursive: true, mode: 0o700 });
  await writeFile(remoteCommandStorePath(root), `${JSON.stringify({ commands: commands.slice(0, 50).map(commandForStorage) }, null, 2)}\n`, "utf8");
}

function normalizeRestoredCommand(command: RemoteCommandRecord, now: Date): RemoteCommandRecord {
  switch (command.status) {
    case "queued":
    case "running":
      return {
        ...command,
        status: "failed",
        error: "Remote daemon restarted before this command finished.",
        updatedAt: now.toISOString(),
        completedAt: now.toISOString(),
        durationMs: elapsed(command.createdAt, now.toISOString()),
      };
    case "done":
    case "failed":
    case "cancelled":
      return command;
    default:
      return assertNever(command.status);
  }
}

function toRemoteCommandRecord(command: StoredCommandRecord): RemoteCommandRecord {
  return {
    id: command.id,
    prompt: command.prompt,
    cwd: command.cwd,
    status: command.status,
    output: command.output,
    activity: (command.activity ?? []).map(toRemoteCommandActivity),
    createdAt: command.createdAt,
    updatedAt: command.updatedAt,
    ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId }),
    ...(command.error === undefined ? {} : { error: command.error }),
    ...(command.startedAt === undefined ? {} : { startedAt: command.startedAt }),
    ...(command.completedAt === undefined ? {} : { completedAt: command.completedAt }),
    ...(command.cancelRequestedAt === undefined ? {} : { cancelRequestedAt: command.cancelRequestedAt }),
    ...(command.durationMs === undefined ? {} : { durationMs: command.durationMs }),
  };
}

function toRemoteCommandActivity(activity: {
  readonly at: string;
  readonly label: string;
  readonly detail?: string | undefined;
}): RemoteCommandActivity {
  return {
    at: activity.at,
    label: activity.label,
    ...(activity.detail === undefined ? {} : { detail: activity.detail }),
  };
}

function commandForStorage(command: RemoteCommandRecord): StoredCommandRecord {
  return {
    id: command.id,
    prompt: command.prompt,
    cwd: command.cwd,
    status: command.status,
    output: command.output,
    activity: command.activity.map((activity) => ({
      at: activity.at,
      label: activity.label,
      ...(activity.detail === undefined ? {} : { detail: activity.detail }),
    })),
    createdAt: command.createdAt,
    updatedAt: command.updatedAt,
    ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId }),
    ...(command.error === undefined ? {} : { error: command.error }),
    ...(command.startedAt === undefined ? {} : { startedAt: command.startedAt }),
    ...(command.completedAt === undefined ? {} : { completedAt: command.completedAt }),
    ...(command.cancelRequestedAt === undefined ? {} : { cancelRequestedAt: command.cancelRequestedAt }),
    ...(command.durationMs === undefined ? {} : { durationMs: command.durationMs }),
  };
}

function elapsed(start: string, end: string): number {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return Number.isNaN(startMs) || Number.isNaN(endMs) ? 0 : Math.max(0, endMs - startMs);
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled command status: ${value}`);
}
