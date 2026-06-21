import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { ansi, paint } from "./ansi.js";

const taskStatusSchema = z.enum(["todo", "doing", "done", "blocked"]);
const taskRecordSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  label: z.string().min(1),
  detail: z.string().min(1),
  status: taskStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskRecord = z.infer<typeof taskRecordSchema>;

export function taskLedgerPath(root: string): string {
  return join(root, "tasks.jsonl");
}

export async function appendTaskRecord(root: string, label: string, detail: string): Promise<TaskRecord> {
  const tasks = await loadTaskRecords(root);
  const now = new Date().toISOString();
  const task: TaskRecord = {
    version: 1,
    id: nextTaskId(tasks),
    label,
    detail: detail.trim(),
    status: "todo",
    createdAt: now,
    updatedAt: now,
  };
  await saveTaskRecords(root, [...tasks, task]);
  return task;
}

export async function loadTaskRecords(root: string): Promise<readonly TaskRecord[]> {
  const content = await readOptional(taskLedgerPath(root));
  if (content === undefined) {
    return [];
  }
  return content.split(/\r?\n/u).filter((line) => line.trim().length > 0).map(parseTaskRecord);
}

export async function updateTaskStatus(root: string, id: string, status: TaskStatus): Promise<TaskRecord | undefined> {
  const tasks = await loadTaskRecords(root);
  const normalizedId = id.trim().toUpperCase();
  let updated: TaskRecord | undefined;
  const now = new Date().toISOString();
  const next = tasks.map((task) => {
    if (task.id.toUpperCase() !== normalizedId) {
      return task;
    }
    updated = { ...task, status, updatedAt: now };
    return updated;
  });
  if (updated !== undefined) {
    await saveTaskRecords(root, next);
  }
  return updated;
}

export async function formatTaskLedger(root: string): Promise<string> {
  const tasks = await loadTaskRecords(root);
  if (tasks.length === 0) {
    return `${paint("Tasks", `${ansi.bold}${ansi.accent}`)}\n${paint("No tasks yet.", ansi.dim)}`;
  }
  const open = tasks.filter((task) => task.status !== "done").length;
  return [
    `${paint("Tasks", `${ansi.bold}${ansi.accent}`)} ${tasks.length} total ${paint("·", ansi.guide)} ${open} open`,
    ...tasks.slice(-12).map(formatTaskLine),
    paint("Use /tasks <text>, /tasks doing T001, /tasks done T001, or /tasks block T001.", ansi.dim),
  ].join("\n");
}

export async function formatTaskSummary(root: string): Promise<string> {
  const tasks = await loadTaskRecords(root);
  if (tasks.length === 0) {
    return "tasks: none";
  }
  const open = tasks.filter((task) => task.status !== "done").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  return `tasks: ${open} open, ${blocked} blocked, ${tasks.length - open} done`;
}

export function parseTaskStatus(input: string): TaskStatus | undefined {
  const normalized = input.trim().toLowerCase();
  if (normalized === "block") {
    return "blocked";
  }
  const parsed = taskStatusSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

async function saveTaskRecords(root: string, tasks: readonly TaskRecord[]): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(taskLedgerPath(root), tasks.map((task) => JSON.stringify(task)).join("\n") + "\n", "utf8");
}

function parseTaskRecord(line: string): TaskRecord {
  const parsedJson: unknown = JSON.parse(line);
  return taskRecordSchema.parse(parsedJson);
}

function nextTaskId(tasks: readonly TaskRecord[]): string {
  const nextNumber = tasks.length + 1;
  return `T${nextNumber.toString().padStart(3, "0")}`;
}

function formatTaskLine(task: TaskRecord): string {
  return `${paint(task.id, ansi.blue)} ${paint(task.status, statusColor(task.status))} ${task.label}: ${task.detail}`;
}

function statusColor(status: TaskStatus): string {
  switch (status) {
    case "todo":
      return ansi.muted;
    case "doing":
      return ansi.yellow;
    case "done":
      return ansi.green;
    case "blocked":
      return ansi.red;
    default:
      return assertNever(status);
  }
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
  throw new Error(`Unexpected task status: ${String(value)}`);
}
