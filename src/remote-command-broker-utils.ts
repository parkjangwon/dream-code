import type { RemoteCommandActivity, RemoteCommandRecord } from "./remote-command-broker.js";

export function isTerminalRemoteCommand(record: RemoteCommandRecord): boolean {
  return record.status === "done" || record.status === "failed" || record.status === "cancelled";
}

export function elapsedRemoteCommandMs(start: string, end: string): number {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return Number.isNaN(startMs) || Number.isNaN(endMs) ? 0 : Math.max(0, endMs - startMs);
}

export function nextRemoteActivity(
  current: readonly RemoteCommandActivity[],
  entry: RemoteCommandActivity,
): readonly RemoteCommandActivity[] {
  const latest = current.at(-1);
  if (latest?.label === entry.label && latest.detail === entry.detail) {
    return current;
  }
  return [...current, entry].slice(-20);
}

export function clearTemporaryRemoteCommandFields(record: RemoteCommandRecord): RemoteCommandRecord {
  const { runnerPrompt, temporaryUploads, ...rest } = record;
  return { ...rest, updatedAt: new Date().toISOString() };
}
