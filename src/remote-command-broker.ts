import type { RemoteCommandActivityInput, RemoteCommandInput, RemoteCommandResult } from "./remote-command.js";
import { loadRemoteCommandRecords, saveRemoteCommandRecords } from "./remote-command-store.js";
import { cleanupRemoteUploads, type RemoteUploadedFile } from "./remote-upload.js";

export type RemoteCommandStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type RemoteCommandRecord = {
  readonly id: string;
  readonly prompt: string;
  readonly runnerPrompt?: string;
  readonly cwd: string;
  readonly status: RemoteCommandStatus;
  readonly output: string;
  readonly activity: readonly RemoteCommandActivity[];
  readonly sessionId?: string;
  readonly error?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly cancelRequestedAt?: string;
  readonly durationMs?: number;
  readonly temporaryUploads?: readonly RemoteUploadedFile[];
};

export type RemoteCommandActivity = {
  readonly at: string;
  readonly label: string;
  readonly detail?: string;
};

export type RemoteCommandEvent =
  | { readonly type: "snapshot"; readonly commands: readonly RemoteCommandRecord[] }
  | { readonly type: "command"; readonly command: RemoteCommandRecord };

export type RemoteCommandRunner = (input: RemoteCommandInput) => Promise<RemoteCommandResult>;

export type RemoteCommandSubmitInput = {
  readonly prompt: string;
  readonly cwd: string;
  readonly sessionId?: string;
  readonly runnerPrompt?: string;
  readonly temporaryUploads?: readonly RemoteUploadedFile[];
};

export type RemoteCommandBroker = {
  readonly submit: (input: RemoteCommandSubmitInput) => RemoteCommandRecord;
  readonly cancel: (id: string) => RemoteCommandRecord | undefined;
  readonly commands: () => readonly RemoteCommandRecord[];
  readonly subscribe: (listener: (event: RemoteCommandEvent) => void) => () => void;
  readonly flush: () => Promise<void>;
};

export async function createRemoteCommandBroker(configRoot: string, runner: RemoteCommandRunner): Promise<RemoteCommandBroker> {
  let sequence = 0;
  let queue: Promise<void> = Promise.resolve();
  let saveQueue: Promise<void> = Promise.resolve();
  let records: readonly RemoteCommandRecord[] = await loadRemoteCommandRecords(configRoot);
  const controllers = new Map<string, AbortController>();
  const listeners = new Set<(event: RemoteCommandEvent) => void>();

  function emit(event: RemoteCommandEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function upsert(record: RemoteCommandRecord): RemoteCommandRecord {
    records = [record, ...records.filter((entry) => entry.id !== record.id)].slice(0, 50);
    saveQueue = saveQueue.then(() => saveRemoteCommandRecords(configRoot, records), () => saveRemoteCommandRecords(configRoot, records));
    emit({ type: "command", command: record });
    return record;
  }

  function patch(id: string, update: (record: RemoteCommandRecord) => RemoteCommandRecord): RemoteCommandRecord | undefined {
    const current = records.find((record) => record.id === id);
    if (current === undefined) {
      return undefined;
    }
    return upsert(update(current));
  }

  function appendActivity(id: string, activity: RemoteCommandActivityInput): RemoteCommandRecord | undefined {
    const now = new Date().toISOString();
    return patch(id, (record) => ({
      ...record,
      activity: nextActivity(record.activity, {
        at: now,
        label: activity.label,
        ...(activity.detail === undefined ? {} : { detail: activity.detail }),
      }),
      updatedAt: now,
    }));
  }

  function submit(input: RemoteCommandSubmitInput): RemoteCommandRecord {
    sequence += 1;
    const now = new Date().toISOString();
    const record: RemoteCommandRecord = {
      id: `remote_${now.replace(/[-:.]/gu, "")}_${sequence.toString(36)}`,
      prompt: input.prompt,
      cwd: input.cwd,
      status: "queued",
      output: "",
      activity: [{ at: now, label: "Prompt received", detail: "Queued on the remote daemon" }],
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      ...(input.runnerPrompt === undefined ? {} : { runnerPrompt: input.runnerPrompt }),
      ...(input.temporaryUploads === undefined || input.temporaryUploads.length === 0 ? {} : { temporaryUploads: input.temporaryUploads }),
      createdAt: now,
      updatedAt: now,
    };
    upsert(record);
    queue = queue.then(() => execute(record.id), () => execute(record.id));
    return record;
  }

  function cancel(id: string): RemoteCommandRecord | undefined {
    const controller = controllers.get(id);
    controller?.abort();
    const now = new Date().toISOString();
    return patch(id, (record) => isTerminal(record)
      ? record
      : {
        ...record,
        status: "cancelled",
        error: record.status === "queued" ? "Cancelled before it started." : "Cancelled by remote device.",
        cancelRequestedAt: now,
        completedAt: now,
        durationMs: elapsedMs(record.createdAt, now),
        updatedAt: now,
      });
  }

  async function execute(id: string): Promise<void> {
    const controller = new AbortController();
    controllers.set(id, controller);
    try {
      const startedAt = new Date().toISOString();
      const started = patch(id, (record) => record.status === "cancelled"
        ? record
        : {
          ...record,
          status: "running",
          activity: nextActivity(record.activity, {
            at: startedAt,
            label: "Worker started",
            detail: "Starting the remote Dream Code run",
          }),
          startedAt,
          updatedAt: startedAt,
        });
      if (started?.status === "cancelled") {
        return;
      }
      const current = records.find((record) => record.id === id);
      if (current === undefined) {
        return;
      }
      const result = await runner({
        configRoot,
        prompt: current.runnerPrompt ?? current.prompt,
        cwd: current.cwd,
        ...(current.sessionId === undefined ? {} : { sessionId: current.sessionId }),
        signal: controller.signal,
        onActivity: (activity) => {
          appendActivity(id, activity);
        },
        onSession: (sessionId) => {
          patch(id, (record) => ({ ...record, sessionId, updatedAt: new Date().toISOString() }));
        },
        onChunk: (chunk) => {
          const now = new Date().toISOString();
          patch(id, (record) => ({
            ...record,
            activity: nextActivity(record.activity, {
              at: now,
              label: "Output received",
              detail: "Dream Code produced visible text",
            }),
            output: `${record.output}${chunk}`,
            updatedAt: now,
          }));
        },
      });
      if (controller.signal.aborted) {
        cancel(id);
        return;
      }
      const completedAt = new Date().toISOString();
      patch(id, (record) => ({
        ...record,
        status: "done",
        output: result.output,
        sessionId: result.sessionId,
        completedAt,
        durationMs: elapsedMs(record.createdAt, completedAt),
        updatedAt: completedAt,
      }));
    } catch (error) {
      const completedAt = new Date().toISOString();
      patch(id, (record) => ({
        ...record,
        status: controller.signal.aborted ? "cancelled" : "failed",
        error: controller.signal.aborted ? "Cancelled by remote device." : error instanceof Error ? error.message : "Remote command failed.",
        completedAt,
        durationMs: elapsedMs(record.createdAt, completedAt),
        updatedAt: completedAt,
      }));
    } finally {
      const latest = records.find((record) => record.id === id);
      if (latest?.temporaryUploads !== undefined && latest.temporaryUploads.length > 0) {
        await cleanupRemoteUploads(latest.temporaryUploads);
        patch(id, clearTemporaryFields);
      }
      controllers.delete(id);
    }
  }

  return {
    submit,
    cancel,
    commands: () => records,
    subscribe: (listener) => {
      listeners.add(listener);
      listener({ type: "snapshot", commands: records });
      return () => {
        listeners.delete(listener);
      };
    },
    flush: () => saveQueue,
  };
}

function isTerminal(record: RemoteCommandRecord): boolean {
  return record.status === "done" || record.status === "failed" || record.status === "cancelled";
}

function elapsedMs(start: string, end: string): number {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return Number.isNaN(startMs) || Number.isNaN(endMs) ? 0 : Math.max(0, endMs - startMs);
}

function nextActivity(
  current: readonly RemoteCommandActivity[],
  entry: RemoteCommandActivity,
): readonly RemoteCommandActivity[] {
  const latest = current.at(-1);
  if (latest?.label === entry.label && latest.detail === entry.detail) {
    return current;
  }
  return [...current, entry].slice(-20);
}

function clearTemporaryFields(record: RemoteCommandRecord): RemoteCommandRecord {
  const { runnerPrompt, temporaryUploads, ...rest } = record;
  return { ...rest, updatedAt: new Date().toISOString() };
}
