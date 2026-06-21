import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { stripAnsi } from "./ansi.js";
import {
  agentRunsRoot,
  parseAgentRunRecord,
  type AgentRunHandle,
  type AgentRunRecord,
  type AgentRunStatus,
  type StartAgentRunInput,
} from "./agent-run-record.js";

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
    tool: (label, changedPath) => {
      const at = touch();
      const writePaths = changedPath === undefined || record.writePaths.includes(changedPath)
        ? record.writePaths
        : [...record.writePaths, changedPath];
      setRecord({
        ...record,
        updatedAt: at,
        lastActivity: at,
        toolCalls: record.toolCalls + 1,
        writePaths,
      });
      enqueue(async () => {
        await appendWire({ at, type: "tool", label });
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
  const persisted = (await readPersistedRuns(root))
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

async function readPersistedRuns(root: string): Promise<readonly AgentRunRecord[]> {
  let entries: readonly string[];
  try {
    entries = await readdir(agentRunsRoot(root));
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const records = await Promise.all(entries.map((entry) => readState(join(agentRunsRoot(root), entry, "state.json"))));
  return records.filter(isAgentRunRecord);
}

async function readState(filePath: string): Promise<AgentRunRecord | undefined> {
  try {
    const parsedJson: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return parseAgentRunRecord(parsedJson);
  } catch (error) {
    if (error instanceof SyntaxError || (isErrnoException(error) && error.code === "ENOENT")) {
      return undefined;
    }
    throw error;
  }
}

function runId(agentId: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.]/gu, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${timestamp}_${slug(agentId)}_${suffix}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-|-$/gu, "") || "agent";
}

function isAgentRunRecord(value: AgentRunRecord | undefined): value is AgentRunRecord {
  return value !== undefined;
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
