import { ansi, paint } from "./ansi.js";
import type { AgentRunRecord, AgentRunStatus } from "./agent-run-record.js";
import { listAgentRuns } from "./agent-run-store.js";

export async function formatAgentRuns(root: string): Promise<string> {
  const runs = await listAgentRuns(root);
  if (runs.length === 0) {
    return [
      paint("Running", ansi.accent),
      paint("No subagents are currently running.", ansi.dim),
      "",
    ].join("\n");
  }

  const activeCount = runs.filter((run) => run.status === "running" || run.status === "queued").length;
  return [
    `${paint("Running", ansi.accent)} ${paint(`${activeCount} active`, ansi.bold)} ${paint("·", ansi.guide)} ${runs.length} recent`,
    ...runs.map(formatRunLine),
    "",
  ].join("\n");
}

function formatRunLine(run: AgentRunRecord): string {
  return [
    statusLabel(run.status),
    paint(run.agentName.padEnd(22), ansi.bold),
    paint(formatAge(run.startedAt, run.endedAt), ansi.dim),
    paint(formatCharacters(run.outputChars).padStart(10), ansi.guide),
    paint(`tools ${run.toolCalls}`, ansi.dim),
    paint(truncate(run.prompt, 56), ansi.blue),
  ].join(" ");
}

function statusLabel(status: AgentRunStatus): string {
  switch (status) {
    case "queued":
      return paint("QUEUED ", ansi.dim);
    case "running":
      return paint("RUNNING", ansi.yellow);
    case "done":
      return paint("DONE   ", ansi.green);
    case "failed":
      return paint("FAILED ", ansi.red);
    case "cancelled":
      return paint("STOPPED", ansi.yellow);
    default:
      return assertNever(status);
  }
}

function formatAge(startedAt: string, endedAt: string | undefined): string {
  const start = Date.parse(startedAt);
  const end = endedAt === undefined ? Date.now() : Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "0.0s";
  }
  return `${(Math.max(0, end - start) / 1000).toFixed(1)}s`;
}

function formatCharacters(characters: number): string {
  return characters < 1000 ? `${characters} chars` : `${(characters / 1000).toFixed(1)}k chars`;
}

function truncate(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected agent run status: ${String(value)}`);
}
