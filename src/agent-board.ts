import { readFile } from "node:fs/promises";

import { ansi, paint, stripAnsi } from "./ansi.js";
import type { AgentRunRecord, AgentRunStatus } from "./agent-run-record.js";
import { listAgentRuns } from "./agent-run-store.js";
import type { ActorRecord, ActorStatus } from "./actor-record.js";
import { listActors } from "./actor-store.js";
import { listPendingInboxMessages } from "./inbox-store.js";

export type AgentBoardRow = {
  readonly id: string;
  readonly runId?: string;
  readonly actorId?: string;
  readonly group: AgentBoardGroup;
  readonly status: string;
  readonly name: string;
  readonly age: string;
  readonly inboxCount: number;
  readonly summary: string;
  readonly prompt: string;
};

export type AgentBoardGroup = "needs-input" | "working" | "completed";

export async function listAgentBoardRows(root: string): Promise<readonly AgentBoardRow[]> {
  const runs = await listAgentRuns(root, 30);
  const actors = await listActors(root, 50);
  const inboxCounts = await pendingInboxCountsByActor(root);
  const actorsByRun = new Map(actors.flatMap((actor) => actor.runId === undefined ? [] : [[actor.runId, actor] as const]));
  const rows = await Promise.all(runs.map((run) => rowFromRun(run, actorsByRun.get(run.id), inboxCounts)));
  const actorOnlyRows = actors
    .filter((actor) => actor.runId === undefined || !runs.some((run) => run.id === actor.runId))
    .map((actor) => rowFromActor(actor, inboxCounts.get(actor.id) ?? 0));
  return [...rows, ...actorOnlyRows].sort(compareRows);
}

export async function formatAgentBoard(root: string): Promise<string> {
  const rows = await listAgentBoardRows(root);
  const needsInput = rows.filter((row) => row.group === "needs-input");
  const working = rows.filter((row) => row.group === "working");
  const completed = rows.filter((row) => row.group === "completed");
  return [
    `${paint("Agent Board", ansi.accent)} ${paint(`${needsInput.length} needs input`, ansi.bold)} ${paint("·", ansi.guide)} ${working.length} working ${paint("·", ansi.guide)} ${completed.length} completed`,
    "",
    formatGroup("Needs input", needsInput),
    formatGroup("Working", working),
    formatGroup("Completed", completed.slice(0, 8), completed.length),
  ].join("\n");
}

export async function readAgentRunPreview(run: AgentRunRecord, limit = 320): Promise<string> {
  const output = await readOptionalFile(run.outputPath);
  const fallback = run.error ?? run.prompt;
  const source = output.trim().length > 0 ? readableOutputPreview(stripAnsi(output)) || fallback : fallback;
  return truncate(oneLine(source), limit);
}

function formatGroup(title: string, rows: readonly AgentBoardRow[], totalCount = rows.length): string {
  if (rows.length === 0) {
    return [`${paint(title, ansi.accent)} ${paint("0", ansi.dim)}`, `  ${paint("No sessions here.", ansi.dim)}`, ""].join("\n");
  }
  const count = totalCount === rows.length ? String(rows.length) : `${rows.length} of ${totalCount}`;
  return [
    `${paint(title, ansi.accent)} ${paint(count, ansi.bold)}`,
    ...rows.map(formatRow),
    "",
  ].join("\n");
}

function formatRow(row: AgentBoardRow): string {
  const inbox = row.inboxCount > 0 ? paint(`inbox ${row.inboxCount}`, ansi.yellow) : paint("inbox 0", ansi.dim);
  return [
    " ",
    paint(row.status.padEnd(10), statusColor(row.group)),
    paint(row.name.padEnd(22), ansi.bold),
    paint(row.age.padStart(6), ansi.dim),
    inbox,
    paint(truncate(row.summary, 72), ansi.blue),
  ].join(" ");
}

async function rowFromRun(
  run: AgentRunRecord,
  actor: ActorRecord | undefined,
  inboxCounts: ReadonlyMap<string, number>,
): Promise<AgentBoardRow> {
  const actorStatus = actor?.status;
  const group = groupForRun(run.status, actorStatus);
  const inboxCount = actor === undefined ? 0 : inboxCounts.get(actor.id) ?? 0;
  return {
    id: run.id,
    runId: run.id,
    ...(actor === undefined ? {} : { actorId: actor.id }),
    group,
    status: statusText(run.status, actorStatus),
    name: run.agentName,
    age: formatAge(run.startedAt, run.endedAt),
    inboxCount,
    summary: summaryForRun(run, actor, await readAgentRunPreview(run)),
    prompt: run.prompt,
  };
}

function rowFromActor(actor: ActorRecord, inboxCount: number): AgentBoardRow {
  return {
    id: actor.id,
    actorId: actor.id,
    group: groupForActor(actor.status),
    status: actorStatusText(actor.status),
    name: actor.name,
    age: formatAge(actor.startedAt, actor.endedAt),
    inboxCount,
    summary: actor.summary ?? actor.error ?? actor.task,
    prompt: actor.task,
  };
}

function groupForRun(status: AgentRunStatus, actorStatus: ActorStatus | undefined): AgentBoardGroup {
  if (actorStatus === "idle") {
    return "needs-input";
  }
  switch (status) {
    case "queued":
    case "running":
      return "working";
    case "done":
    case "failed":
    case "cancelled":
      return "completed";
    default:
      return unexpected(status);
  }
}

function groupForActor(status: ActorStatus): AgentBoardGroup {
  switch (status) {
    case "idle":
      return "needs-input";
    case "queued":
    case "running":
      return "working";
    case "done":
    case "failed":
    case "cancelled":
      return "completed";
    default:
      return unexpected(status);
  }
}

function statusText(status: AgentRunStatus, actorStatus: ActorStatus | undefined): string {
  if (actorStatus === "idle") {
    return "NEEDS";
  }
  switch (status) {
    case "queued":
      return "QUEUED";
    case "running":
      return "WORKING";
    case "done":
      return "DONE";
    case "failed":
      return "FAILED";
    case "cancelled":
      return "STOPPED";
    default:
      return unexpected(status);
  }
}

function actorStatusText(status: ActorStatus): string {
  switch (status) {
    case "idle":
      return "NEEDS";
    case "queued":
      return "QUEUED";
    case "running":
      return "WORKING";
    case "done":
      return "DONE";
    case "failed":
      return "FAILED";
    case "cancelled":
      return "STOPPED";
    default:
      return unexpected(status);
  }
}

function summaryForRun(run: AgentRunRecord, actor: ActorRecord | undefined, preview: string): string {
  if (actor?.summary !== undefined) {
    return actor.summary;
  }
  if (run.error !== undefined) {
    return run.error;
  }
  return preview;
}

async function pendingInboxCountsByActor(root: string): Promise<ReadonlyMap<string, number>> {
  const counts = new Map<string, number>();
  for (const message of await listPendingInboxMessages(root)) {
    counts.set(message.receiverActorId, (counts.get(message.receiverActorId) ?? 0) + 1);
  }
  return counts;
}

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function compareRows(left: AgentBoardRow, right: AgentBoardRow): number {
  return groupRank(left.group) - groupRank(right.group);
}

function groupRank(group: AgentBoardGroup): number {
  switch (group) {
    case "needs-input":
      return 0;
    case "working":
      return 1;
    case "completed":
      return 2;
    default:
      return unexpected(group);
  }
}

function statusColor(group: AgentBoardGroup): string {
  switch (group) {
    case "needs-input":
      return ansi.yellow;
    case "working":
      return ansi.green;
    case "completed":
      return ansi.dim;
    default:
      return unexpected(group);
  }
}

function formatAge(startedAt: string, endedAt: string | undefined): string {
  const start = Date.parse(startedAt);
  const end = endedAt === undefined ? Date.now() : Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "0.0s";
  }
  return `${(Math.max(0, end - start) / 1000).toFixed(1)}s`;
}

function oneLine(text: string): string {
  return text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0).join(" ");
}

function readableOutputPreview(text: string): string {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isTransientOutputLine(line))
    .slice(-3)
    .join(" ");
}

function isTransientOutputLine(line: string): boolean {
  return line.includes(" Thinking ") || line.startsWith("Thinking ") || line.startsWith("◆ Tool ");
}

function truncate(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 3))}...`;
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

function unexpected(value: never): never {
  throw new Error(`Unexpected agent board value: ${String(value)}`);
}
