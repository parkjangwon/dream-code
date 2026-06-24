import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { redactJsonSecrets } from "./redaction.js";

const remoteAuditEventSchema = z.object({
  at: z.string().min(1),
  kind: z.string().min(1),
  action: z.string().min(1),
  method: z.string().optional(),
  path: z.string().optional(),
  status: z.union([z.string(), z.number()]).optional(),
  remoteAddress: z.string().optional(),
  commandId: z.string().optional(),
  deviceId: z.string().optional(),
  message: z.string().optional(),
});

export type RemoteAuditEvent = z.infer<typeof remoteAuditEventSchema>;

export type RemoteAuditEventInput = Omit<RemoteAuditEvent, "at" | "action"> & {
  readonly action?: string;
  readonly at?: string;
};

export function remoteAuditPath(root: string): string {
  return join(root, "webapp", "remote-audit.jsonl");
}

export async function appendRemoteAuditEvent(root: string, input: RemoteAuditEventInput): Promise<void> {
  const event: RemoteAuditEvent = redactJsonSecrets({
    at: input.at ?? new Date().toISOString(),
    kind: input.kind,
    action: input.action ?? kindToAction(input.kind),
    ...(input.method === undefined ? {} : { method: input.method }),
    ...(input.path === undefined ? {} : { path: input.path }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.remoteAddress === undefined ? {} : { remoteAddress: input.remoteAddress }),
    ...(input.commandId === undefined ? {} : { commandId: input.commandId }),
    ...(input.deviceId === undefined ? {} : { deviceId: input.deviceId }),
    ...(input.message === undefined ? {} : { message: input.message }),
  });
  await mkdir(join(root, "webapp"), { recursive: true, mode: 0o700 });
  await appendFile(remoteAuditPath(root), `${JSON.stringify(event)}\n`, "utf8");
}

export async function readRemoteAuditEvents(root: string, limit = 100): Promise<readonly RemoteAuditEvent[]> {
  let raw: string;
  try {
    raw = await readFile(remoteAuditPath(root), "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return raw
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => redactJsonSecrets(remoteAuditEventSchema.parse(JSON.parse(line))))
    .slice(-limit)
    .reverse();
}

function kindToAction(kind: string): string {
  return kind.replace(/_/gu, ".");
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
