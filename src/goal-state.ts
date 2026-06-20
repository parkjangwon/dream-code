import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { ansi, paint } from "./ansi.js";

const goalStatusSchema = z.enum(["active", "complete"]);
const goalEvidenceSchema = z.object({
  at: z.string(),
  note: z.string().min(1),
});
const goalStateSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1),
  status: goalStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  evidence: z.array(goalEvidenceSchema),
});

export type GoalState = z.infer<typeof goalStateSchema>;

export class GoalStateParseError extends Error {
  readonly filePath: string;

  constructor(filePath: string, reason: string) {
    super(`Could not parse Dream Code goal at ${filePath}: ${reason}`);
    this.name = "GoalStateParseError";
    this.filePath = filePath;
  }
}

export function goalStatePath(root: string): string {
  return join(root, "goal.json");
}

export async function loadGoalState(root: string): Promise<GoalState | undefined> {
  const filePath = goalStatePath(root);
  try {
    const parsedJson: unknown = JSON.parse(await readFile(filePath, "utf8"));
    const parsed = goalStateSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new GoalStateParseError(filePath, parsed.error.message);
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new GoalStateParseError(filePath, error.message);
    }
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function startGoalState(root: string, title: string): Promise<GoalState> {
  const now = new Date().toISOString();
  const state: GoalState = {
    version: 1,
    title: title.trim(),
    status: "active",
    createdAt: now,
    updatedAt: now,
    evidence: [],
  };
  await saveGoalState(root, state);
  return state;
}

export async function completeGoalState(root: string, note: string): Promise<GoalState | undefined> {
  const state = await loadGoalState(root);
  if (state === undefined) {
    return undefined;
  }
  const now = new Date().toISOString();
  const next: GoalState = {
    ...state,
    status: "complete",
    updatedAt: now,
    evidence: [...state.evidence, { at: now, note: note.trim().length === 0 ? "Completed." : note.trim() }],
  };
  await saveGoalState(root, next);
  return next;
}

export async function clearGoalState(root: string): Promise<boolean> {
  try {
    await rm(goalStatePath(root), { force: false });
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function formatGoalStatus(root: string): Promise<string> {
  const state = await loadGoalState(root);
  if (state === undefined) {
    return `${paint("Goal", `${ansi.bold}${ansi.accent}`)}\n${paint("No active goal.", ansi.dim)}`;
  }
  return [
    paint("Goal", `${ansi.bold}${ansi.accent}`),
    `${paint("status", ansi.muted)} ${paint(state.status, state.status === "active" ? ansi.green : ansi.blue)}`,
    `${paint("title", ansi.muted)} ${state.title}`,
    `${paint("updated", ansi.muted)} ${state.updatedAt}`,
    ...state.evidence.slice(-5).map((item) => `${paint("•", ansi.guide)} ${item.note}`),
  ].join("\n");
}

async function saveGoalState(root: string, state: GoalState): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(goalStatePath(root), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
