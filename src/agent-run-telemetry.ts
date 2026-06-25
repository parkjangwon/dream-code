import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import type { AgentRunRecord } from "./agent-run-record.js";

const agentRunTelemetrySchema = z.object({
  version: z.literal(1),
  at: z.string().min(1),
  runId: z.string().min(1),
  kind: z.string().min(1),
  agentId: z.string().min(1),
  status: z.enum(["done", "failed", "cancelled"]),
  durationMs: z.number().int().nonnegative(),
  inputChars: z.number().int().nonnegative(),
  outputChars: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  changedFiles: z.number().int().nonnegative(),
  failedTools: z.number().int().nonnegative(),
  error: z.string().optional(),
});

export type AgentRunTelemetryRecord = z.infer<typeof agentRunTelemetrySchema>;

export function agentRunTelemetryPath(root: string): string {
  return join(root, "agent_run_telemetry.jsonl");
}

export async function recordAgentRunTelemetry(root: string, record: AgentRunRecord): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await appendFile(agentRunTelemetryPath(root), `${JSON.stringify(telemetryRecord(record))}\n`, "utf8");
}

export async function loadAgentRunTelemetry(root: string): Promise<readonly AgentRunTelemetryRecord[]> {
  const content = await readOptional(agentRunTelemetryPath(root));
  if (content === undefined) {
    return [];
  }
  return content
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map(parseAgentRunTelemetry);
}

function telemetryRecord(record: AgentRunRecord): AgentRunTelemetryRecord {
  return {
    version: 1,
    at: new Date().toISOString(),
    runId: record.id,
    kind: record.kind,
    agentId: record.agentId,
    status: finishedStatus(record.status),
    durationMs: durationMs(record),
    inputChars: record.inputChars,
    outputChars: record.outputChars,
    toolCalls: record.toolCalls,
    changedFiles: record.changedFiles.length,
    failedTools: record.toolEvents.filter((event) => !event.ok).length,
    ...(record.error === undefined ? {} : { error: record.error }),
  };
}

function finishedStatus(status: AgentRunRecord["status"]): AgentRunTelemetryRecord["status"] {
  switch (status) {
    case "done":
    case "failed":
    case "cancelled":
      return status;
    case "queued":
    case "running":
      return "cancelled";
    default:
      return assertNever(status);
  }
}

function durationMs(record: AgentRunRecord): number {
  const started = Date.parse(record.startedAt);
  const ended = Date.parse(record.endedAt ?? record.updatedAt);
  return Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, ended - started) : 0;
}

function parseAgentRunTelemetry(line: string): AgentRunTelemetryRecord {
  const parsedJson: unknown = JSON.parse(line);
  return agentRunTelemetrySchema.parse(parsedJson);
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

function assertNever(value: never): never {
  throw new Error(`Unexpected agent run status: ${String(value)}`);
}
