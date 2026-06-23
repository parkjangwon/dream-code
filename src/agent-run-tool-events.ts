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
