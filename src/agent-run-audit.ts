import type { AgentRunRecord } from "./agent-run-record.js";
import { redactJsonSecrets } from "./redaction.js";

export function agentRunAudit(run: AgentRunRecord): object {
  const tools = run.toolEvents.map((event) => ({
    label: event.label,
    ok: event.ok,
    ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
    ...(event.batchId === undefined ? {} : { batchId: event.batchId }),
    ...(event.sequence === undefined ? {} : { sequence: event.sequence }),
    ...(event.risk === undefined ? {} : { risk: event.risk }),
    ...(event.failureClass === undefined ? {} : { failureClass: event.failureClass }),
    ...(event.recovery === undefined ? {} : { recovery: event.recovery }),
    ...(event.nextAction === undefined ? {} : { nextAction: event.nextAction }),
  }));
  return redactJsonSecrets({
    id: run.id,
    status: run.status,
    kind: run.kind,
    agent: run.agentName,
    prompt: run.prompt,
    toolCalls: run.toolCalls,
    changedFiles: run.changedFiles,
    checkpoints: run.checkpoints.length,
    ...(run.error === undefined ? {} : { error: run.error }),
    telemetry: {
      failedTools: run.toolEvents.filter((event) => !event.ok).length,
      totalDurationMs: run.toolEvents.reduce((total, event) => total + (event.durationMs ?? 0), 0),
      tools,
    },
  });
}
