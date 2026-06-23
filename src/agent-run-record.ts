import { join } from "node:path";
import { z } from "zod";

const agentRunKindSchema = z.enum(["agent", "swarm-lane", "swarm-synthesis"]);
const agentRunStatusSchema = z.enum(["queued", "running", "done", "failed", "cancelled"]);
const agentRunCheckpointSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  path: z.string().min(1),
  workspaceRoot: z.string().min(1),
  snapshotPath: z.string().min(1),
});
const agentRunToolEventSchema = z.object({
  at: z.string().min(1),
  label: z.string().min(1),
  ok: z.boolean(),
  changedPath: z.string().min(1).optional(),
  checkpoints: z.array(agentRunCheckpointSchema).default([]),
});

export const agentRunRecordSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  kind: agentRunKindSchema,
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  prompt: z.string(),
  status: agentRunStatusSchema,
  startedAt: z.string(),
  updatedAt: z.string(),
  lastActivity: z.string(),
  inputChars: z.number().int().nonnegative(),
  outputChars: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  writePaths: z.array(z.string()),
  changedFiles: z.array(z.string()).default([]),
  checkpoints: z.array(agentRunCheckpointSchema).default([]),
  toolEvents: z.array(agentRunToolEventSchema).default([]),
  transcriptPath: z.string().min(1),
  outputPath: z.string().min(1),
  lastToolAt: z.string().optional(),
  resumeHint: z.string().optional(),
  endedAt: z.string().optional(),
  error: z.string().optional(),
});

export type AgentRunKind = z.infer<typeof agentRunKindSchema>;
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
export type AgentRunCheckpoint = z.infer<typeof agentRunCheckpointSchema>;
export type AgentRunToolEvent = z.infer<typeof agentRunToolEventSchema>;
export type AgentRunRecord = z.infer<typeof agentRunRecordSchema>;

export type StartAgentRunInput = {
  readonly id?: string;
  readonly kind: AgentRunKind;
  readonly agentId: string;
  readonly agentName: string;
  readonly prompt: string;
  readonly signal?: AbortSignal;
};

export type FinishAgentRunOptions = {
  readonly error?: string;
};

export type AgentRunHandle = {
  readonly id: string;
  readonly signal: AbortSignal;
  readonly snapshot: () => AgentRunRecord;
  readonly write: (chunk: string) => void;
  readonly tool: (
    label: string,
    eventOrChangedPath?: string | AgentRunToolEventInput,
    checkpoint?: AgentRunCheckpoint,
  ) => void;
  readonly finish: (status: Exclude<AgentRunStatus, "queued" | "running">, options?: FinishAgentRunOptions) => Promise<void>;
  readonly abort: () => void;
};

export type AgentRunToolEventInput = {
  readonly ok?: boolean;
  readonly changedPath?: string;
  readonly checkpoints?: readonly (AgentRunCheckpoint | undefined)[];
};

export function agentRunsRoot(root: string): string {
  return join(root, "agents", "runs");
}

export function parseAgentRunRecord(value: unknown): AgentRunRecord | undefined {
  const parsed = agentRunRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
