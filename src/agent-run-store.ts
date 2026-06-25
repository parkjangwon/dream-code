import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { stripAnsi } from "./ansi.js";
import { recordAgentRunTelemetry, agentRunTelemetryPath } from "./agent-run-telemetry.js";
import {
  agentRunsRoot,
  parseAgentRunRecord,
  type AgentRunHandle,
  type AgentRunCheckpoint,
  type AgentRunRecord,
  type AgentRunStatus,
  type StartAgentRunInput,
} from "./agent-run-record.js";
import { readAgentRunState, readPersistedAgentRuns } from "./agent-run-persisted.js";
import { mergeRunCheckpoints, normalizeRunToolEvent } from "./agent-run-tool-events.js";
import {
  formatAgentRunDiff as formatRunDiff,
  formatAgentRunResumeContext as formatRunResumeContext,
  revertAgentRunChanges as revertRunChanges,
} from "./agent-run-history.js";

export { agentRunTelemetryPath } from "./agent-run-telemetry.js";

type ActiveRun = {
  readonly root: string;
  readonly snapshot: () => AgentRunRecord;
  readonly abort: () => void;
};

type WireEvent = {
  readonly at: string;
  readonly type: "start" | "chunk" | "tool" | "finish";
  readonly text?: string;
  readonly label?: string;
  readonly status?: AgentRunStatus;
  readonly error?: string;
};

const activeRuns = new Map<string, ActiveRun>();

export async function startAgentRun(root: string, input: StartAgentRunInput): Promise<AgentRunHandle> {
  const id = input.id ?? runId(input.agentId);
  const runRoot = join(agentRunsRoot(root), id);
  const transcriptPath = join(runRoot, "wire.jsonl");
  const outputPath = join(runRoot, "output.md");
  const statePath = join(runRoot, "state.json");
  const controller = new AbortController();
  const startedAt = new Date().toISOString();
  let record: AgentRunRecord = {
    version: 1,
    id,
    kind: input.kind,
    agentId: input.agentId,
    agentName: input.agentName,
    prompt: input.prompt,
    status: "running",
    startedAt,
    updatedAt: startedAt,
    lastActivity: startedAt,
    inputChars: input.prompt.length,
    outputChars: 0,
    toolCalls: 0,
    writePaths: [],
    changedFiles: [],
    checkpoints: [],
    toolEvents: [],
    transcriptPath,
    outputPath,
  };
  let pending = Promise.resolve();
  const enqueue = (operation: () => Promise<void>): void => {
    pending = pending.then(operation, operation);
  };
  const setRecord = (next: AgentRunRecord): void => {
    record = next;
  };
  const persistState = async (): Promise<void> => {
    await mkdir(runRoot, { recursive: true, mode: 0o700 });
    await writeFile(statePath, `${JSON.stringify(record, undefined, 2)}\n`, "utf8");
  };
  const appendWire = async (event: WireEvent): Promise<void> => {
    await mkdir(runRoot, { recursive: true, mode: 0o700 });
    await appendFile(transcriptPath, `${JSON.stringify(event)}\n`, "utf8");
  };
  const touch = (): string => new Date().toISOString();
  const externalAbort = (): void => {
    controller.abort();
  };

  if (input.signal?.aborted === true) {
    controller.abort();
  } else {
    input.signal?.addEventListener("abort", externalAbort, { once: true });
  }

  await mkdir(runRoot, { recursive: true, mode: 0o700 });
  await persistState();
  await appendWire({ at: startedAt, type: "start", text: input.prompt });

  const handle: AgentRunHandle = {
    id,
    signal: controller.signal,
    snapshot: () => record,
    write: (chunk) => {
      const plain = stripAnsi(chunk);
      const at = touch();
      setRecord({
        ...record,
        updatedAt: at,
        lastActivity: at,
        outputChars: record.outputChars + plain.length,
      });
      enqueue(async () => {
        await appendFile(outputPath, plain, "utf8");
        await appendWire({ at, type: "chunk", text: plain });
      });
    },
    tool: (label, eventOrChangedPath, checkpoint) => {
      const at = touch();
      const event = normalizeRunToolEvent(label, at, eventOrChangedPath, checkpoint);
      const changedPath = event.changedPath;
      const writePaths = changedPath === undefined || record.writePaths.includes(changedPath)
        ? record.writePaths
        : [...record.writePaths, changedPath];
      const changedFiles = changedPath === undefined || record.changedFiles.includes(changedPath)
        ? record.changedFiles
        : [...record.changedFiles, changedPath];
      const checkpoints = mergeRunCheckpoints(record.checkpoints, event.checkpoints);
      setRecord({
        ...record,
        updatedAt: at,
        lastActivity: at,
        lastToolAt: at,
        toolCalls: record.toolCalls + 1,
        writePaths,
        changedFiles,
        checkpoints,
        toolEvents: [...record.toolEvents, event],
      });
      enqueue(async () => {
        await appendWire({ at, type: "tool", label });
        await persistState();
      });
    },
    finish: async (status, options) => {
      const at = touch();
      setRecord({
        ...record,
        status,
        updatedAt: at,
        lastActivity: at,
        endedAt: at,
        ...(options?.error === undefined ? {} : { error: options.error }),
      });
      enqueue(async () => {
        await appendWire({
          at,
          type: "finish",
          status,
          ...(options?.error === undefined ? {} : { error: options.error }),
        });
        await recordAgentRunTelemetry(root, record);
        await persistState();
      });
      await pending;
      activeRuns.delete(id);
      input.signal?.removeEventListener("abort", externalAbort);
    },
    abort: () => {
      controller.abort();
    },
  };

  activeRuns.set(id, {
    root,
    snapshot: handle.snapshot,
    abort: handle.abort,
  });
  return handle;
}

export async function listAgentRuns(root: string, limit = 20): Promise<readonly AgentRunRecord[]> {
  const active = [...activeRuns.values()]
    .filter((run) => run.root === root)
    .map((run) => run.snapshot());
  const activeIds = new Set(active.map((run) => run.id));
  const persisted = (await readPersistedAgentRuns(root))
    .filter((run) => !activeIds.has(run.id));
  return [...active, ...persisted]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}

export function abortAgentRun(id: string): boolean {
  const run = activeRuns.get(id);
  if (run === undefined) {
    return false;
  }
  run.abort();
  return true;
}

export async function formatAgentRunDiff(root: string, runId: string): Promise<string> {
  return formatRunDiff(root, runId);
}

export async function formatAgentRunResumeContext(root: string, runId: string): Promise<string> {
  return formatRunResumeContext(root, runId);
}

export async function revertAgentRunChanges(root: string, runId: string): Promise<{ readonly revertedPaths: readonly string[] }> {
  return revertRunChanges(root, runId);
}

async function readAgentRun(root: string, runId: string): Promise<AgentRunRecord | undefined> {
  const active = activeRuns.get(runId);
  if (active?.root === root) {
    return active.snapshot();
  }
  return readAgentRunState(root, runId);
}

export async function readAgentRunRecord(root: string, runId: string): Promise<AgentRunRecord | undefined> {
  if (runId === "latest") {
    return (await listAgentRuns(root, 1))[0];
  }
  return readAgentRun(root, runId);
}

function runId(agentId: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.]/gu, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${timestamp}_${slug(agentId)}_${suffix}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-|-$/gu, "") || "agent";
}
