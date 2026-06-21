import { z } from "zod";

export const cronJobModeSchema = z.enum(["agent", "workflow", "swarm"]);
export type CronJobMode = z.infer<typeof cronJobModeSchema>;

export const cronRunStatusSchema = z.enum(["completed", "failed", "blocked", "cancelled"]);
export type CronRunStatus = z.infer<typeof cronRunStatusSchema>;

export const cronProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cwd: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type CronProject = z.infer<typeof cronProjectSchema>;

export const cronJobSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  schedule: z.string().min(1),
  timezone: z.string().min(1),
  prompt: z.string().min(1),
  mode: cronJobModeSchema,
  enabled: z.boolean(),
  modelMode: z.enum(["auto", "single"]),
  permissionMode: z.enum(["ask", "auto", "yolo"]),
  notify: z.boolean(),
  outputPath: z.string().min(1).optional(),
  lastRunAt: z.string().min(1).optional(),
  nextRunAt: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type CronJob = z.infer<typeof cronJobSchema>;

export const cronRunSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  status: cronRunStatusSchema,
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  summary: z.string(),
  artifactPath: z.string().min(1).optional(),
  outputPath: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});
export type CronRun = z.infer<typeof cronRunSchema>;

export const cronStoreSchema = z.object({
  version: z.literal(1),
  projects: z.array(cronProjectSchema),
  jobs: z.array(cronJobSchema),
  runs: z.array(cronRunSchema),
});
export type CronStore = z.infer<typeof cronStoreSchema>;

export type CronProjectInput = {
  readonly name: string;
  readonly cwd: string;
};

export type CronJobInput = {
  readonly projectId: string;
  readonly name: string;
  readonly schedule: string;
  readonly timezone: string;
  readonly prompt: string;
  readonly mode?: CronJobMode;
  readonly enabled?: boolean;
  readonly modelMode: "auto" | "single";
  readonly permissionMode: "ask" | "auto" | "yolo";
  readonly notify: boolean;
  readonly outputPath?: string | undefined;
  readonly nextRunAt?: string | undefined;
};

export type CronJobPatch = Partial<Pick<CronJob,
  "name" | "schedule" | "timezone" | "prompt" | "mode" | "enabled" | "modelMode" | "permissionMode" | "notify" | "outputPath" | "lastRunAt" | "nextRunAt"
>>;

export type CronRunInput = Omit<CronRun, "id" | "artifactPath" | "outputPath" | "error"> & {
  readonly artifactPath?: string | undefined;
  readonly outputPath?: string | undefined;
  readonly error?: string | undefined;
};
