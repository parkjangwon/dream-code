import type { AgentRunCheckpoint, AgentRunRecord, AgentRunToolEventInput } from "./agent-run-record.js";

export function normalizeRunToolEvent(
  label: string,
  at: string,
  eventOrChangedPath: string | AgentRunToolEventInput | undefined,
  checkpoint: AgentRunCheckpoint | undefined,
): AgentRunRecord["toolEvents"][number] {
  if (typeof eventOrChangedPath === "object" && eventOrChangedPath !== null) {
    const checkpoints = eventOrChangedPath.checkpoints?.filter(isCheckpoint) ?? [];
    return {
      at,
      label,
      ok: eventOrChangedPath.ok ?? true,
      ...(eventOrChangedPath.changedPath === undefined ? {} : { changedPath: eventOrChangedPath.changedPath }),
      ...(eventOrChangedPath.durationMs === undefined ? {} : { durationMs: Math.max(0, Math.round(eventOrChangedPath.durationMs)) }),
      ...(eventOrChangedPath.batchId === undefined ? {} : { batchId: eventOrChangedPath.batchId }),
      ...(eventOrChangedPath.sequence === undefined ? {} : { sequence: eventOrChangedPath.sequence }),
      ...(eventOrChangedPath.risk === undefined ? {} : { risk: eventOrChangedPath.risk }),
      ...(eventOrChangedPath.failureClass === undefined ? {} : { failureClass: eventOrChangedPath.failureClass }),
      ...(eventOrChangedPath.recovery === undefined ? {} : { recovery: eventOrChangedPath.recovery }),
      ...(eventOrChangedPath.nextAction === undefined ? {} : { nextAction: eventOrChangedPath.nextAction }),
      checkpoints,
    };
  }
  return {
    at,
    label,
    ok: true,
    ...(eventOrChangedPath === undefined ? {} : { changedPath: eventOrChangedPath }),
    checkpoints: checkpoint === undefined ? [] : [checkpoint],
  };
}

export function mergeRunCheckpoints(
  existing: readonly AgentRunCheckpoint[],
  incoming: readonly AgentRunCheckpoint[],
): AgentRunCheckpoint[] {
  const byId = new Map(existing.map((checkpoint) => [checkpoint.id, checkpoint]));
  for (const checkpoint of incoming) {
    byId.set(checkpoint.id, checkpoint);
  }
  return [...byId.values()];
}

function isCheckpoint(value: AgentRunCheckpoint | undefined): value is AgentRunCheckpoint {
  return value !== undefined;
}
