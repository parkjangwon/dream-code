import { join } from "node:path";
import { z } from "zod";

const actorRoleSchema = z.enum(["main", "subagent", "system", "workflow"]);
const actorStatusSchema = z.enum(["queued", "running", "idle", "done", "failed", "cancelled"]);

export const actorRecordSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  role: actorRoleSchema,
  name: z.string().min(1),
  task: z.string().min(1),
  status: actorStatusSchema,
  startedAt: z.string(),
  updatedAt: z.string(),
  parentActorId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  endedAt: z.string().optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
});

export type ActorRole = z.infer<typeof actorRoleSchema>;
export type ActorStatus = z.infer<typeof actorStatusSchema>;
export type ActorRecord = z.infer<typeof actorRecordSchema>;

export type RegisterActorInput = {
  readonly id?: string;
  readonly role: ActorRole;
  readonly name: string;
  readonly task: string;
  readonly parentActorId?: string;
  readonly sessionId?: string;
  readonly runId?: string;
  readonly taskId?: string;
};

export type ActorStatusUpdate = {
  readonly summary?: string;
  readonly error?: string;
};

export function actorsRoot(root: string): string {
  return join(root, "actors");
}

export function actorIndexPath(root: string): string {
  return join(actorsRoot(root), "actors.json");
}

export function actorInboxPath(root: string): string {
  return join(actorsRoot(root), "inbox.jsonl");
}

export function parseActorRecord(value: unknown): ActorRecord | undefined {
  const parsed = actorRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
