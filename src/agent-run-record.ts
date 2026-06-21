import { join } from "node:path";
import { z } from "zod";

const agentRunKindSchema = z.enum(["agent", "swarm-lane", "swarm-synthesis"]);
const agentRunStatusSchema = z.enum(["queued", "running", "done", "failed", "cancelled"]);

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
  transcriptPath: z.string().min(1),
  outputPath: z.string().min(1),
  endedAt: z.string().optional(),
  error: z.string().optional(),
});

export type AgentRunKind = z.infer<typeof agentRunKindSchema>;
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
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
  readonly tool: (label: string, changedPath?: string) => void;
  readonly finish: (status: Exclude<AgentRunStatus, "queued" | "running">, options?: FinishAgentRunOptions) => Promise<void>;
  readonly abort: () => void;
};

export function agentRunsRoot(root: string): string {
  return join(root, "agents", "runs");
}

export function parseAgentRunRecord(value: unknown): AgentRunRecord | undefined {
  const parsed = agentRunRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
