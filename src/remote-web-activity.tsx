import { h } from "preact";
import { useEffect, useState } from "preact/hooks";

import type { CommandRecord } from "./remote-web-api.js";

type ActivityLine = {
  readonly label: string;
  readonly detail: string;
};

type ActivityKind = "agent" | "command" | "read" | "system" | "tool" | "verify" | "write";

const queuedLines: readonly ActivityLine[] = [
  { label: "Prompt received", detail: "Queued on the remote daemon" },
  { label: "Waiting for worker", detail: "Dream Code will start as soon as the lane is free" },
] as const;

const runningLines: readonly ActivityLine[] = [
  { label: "Prompt received", detail: "Preparing the remote run" },
  { label: "Worker started", detail: "Loading project and session context" },
  { label: "Routing model", detail: "Selecting the active Dream Code model" },
  { label: "Thinking", detail: "Reasoning through the request" },
  { label: "Watching activity", detail: "Waiting for tools or model output" },
  { label: "Preparing result", detail: "Final response will appear below this progress log" },
] as const;

export function ProcessSummary(props: { readonly command: CommandRecord }) {
  const latestActivity = activityLines(props.command).at(-1);
  const steps = Math.max(1, props.command.activity.length);
  const tools = props.command.activity.filter((activity) => activityKind(activity.label) === "tool").length;
  return (
    <div class="process-summary" aria-label="Command process summary">
      <div class="process-title-row">
        <span class={`process-status ${props.command.status}`} />
        <span class="process-kicker">{statusPhrase(props.command)}</span>
      </div>
      <strong>{latestActivity?.label ?? "Preparing remote work"}</strong>
      <small>{latestActivity?.detail ?? "Dream Code is setting up the run"}</small>
      <div class="process-insights" aria-label="Process details">
        <span>{steps} step{steps === 1 ? "" : "s"}</span>
        <span>{tools} tool{tools === 1 ? "" : "s"}</span>
        <span>{summaryTime(props.command)}</span>
      </div>
    </div>
  );
}

export function ActivityTimeline(props: { readonly command: CommandRecord }) {
  const now = useNow(isActive(props.command));
  const elapsed = timelineElapsed(props.command, now);
  const lines = activityLines(props.command);
  const visibleCount = props.command.activity.length > 0
    ? lines.length
    : Math.min(lines.length, Math.max(1, Math.floor(elapsed / 3_000) + 1));
  const progress = Math.round((visibleCount / lines.length) * 100);
  return (
    <div class="activity" aria-label="Dream Code progress">
      <div class="activity-head">
        <span class="thinking-bars" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span>{timelineHeading(props.command)} · {formatElapsed(elapsed)}</span>
      </div>
      <span class="step-meter" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </span>
      <ol class="activity-list">
        {lines.slice(0, visibleCount).map((line, index) => (
          <li class={index === visibleCount - 1 ? "active" : "done"} key={line.label}>
            <span class="activity-dot" />
            <span>
              <strong>
                <span class={`activity-kind ${activityKind(line.label)}`}>{activityKindLabel(activityKind(line.label))}</span>
                {line.label}
              </strong>
              <small>{line.detail}</small>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function activityLines(command: CommandRecord): readonly ActivityLine[] {
  if (command.activity.length > 0) {
    return command.activity.map((activity) => ({
      label: activity.label,
      detail: activity.detail ?? formatActivityTime(activity.at),
    }));
  }
  return command.status === "queued" ? queuedLines : runningLines;
}

function statusPhrase(command: CommandRecord): string {
  switch (command.status) {
    case "queued":
      return "Queued for remote work";
    case "running":
      return "Dream Code is working";
    case "done":
      return "Run completed";
    case "failed":
      return "Run needs attention";
    case "cancelled":
      return "Run cancelled";
    default:
      return assertNever(command.status);
  }
}

function summaryTime(command: CommandRecord): string {
  if (command.durationMs !== undefined) {
    return formatElapsed(command.durationMs);
  }
  return formatElapsed(elapsedMs(command.startedAt ?? command.createdAt, Date.now()));
}

function timelineElapsed(command: CommandRecord, now: number): number {
  if (command.durationMs !== undefined) {
    return command.durationMs;
  }
  return elapsedMs(command.startedAt ?? command.createdAt, now);
}

function timelineHeading(command: CommandRecord): string {
  switch (command.status) {
    case "queued":
    case "running":
      return "Working";
    case "done":
      return "Process";
    case "failed":
      return "Stopped";
    case "cancelled":
      return "Cancelled";
    default:
      return assertNever(command.status);
  }
}

function activityKind(label: string): ActivityKind {
  const normalized = label.toLowerCase();
  if (normalized.includes("tool")) {
    return "tool";
  }
  if (normalized.includes("build") || normalized.includes("check") || normalized.includes("test") || normalized.includes("verify")) {
    return "verify";
  }
  if (normalized.includes("read") || normalized.includes("loading")) {
    return "read";
  }
  if (normalized.includes("write") || normalized.includes("recording") || normalized.includes("saving")) {
    return "write";
  }
  if (normalized.includes("command") || normalized.includes("running")) {
    return "command";
  }
  if (normalized.includes("agent") || normalized.includes("thinking") || normalized.includes("reasoning")) {
    return "agent";
  }
  return "system";
}

function activityKindLabel(kind: ActivityKind): string {
  switch (kind) {
    case "agent":
      return "AI";
    case "command":
      return "CMD";
    case "read":
      return "READ";
    case "system":
      return "SYS";
    case "tool":
      return "TOOL";
    case "verify":
      return "CHECK";
    case "write":
      return "WRITE";
    default:
      return assertNever(kind);
  }
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function isActive(command: CommandRecord): boolean {
  return command.status === "queued" || command.status === "running";
}

function elapsedMs(start: string, now: number): number {
  const startMs = Date.parse(start);
  return Number.isNaN(startMs) ? 0 : Math.max(0, now - startMs);
}

function formatElapsed(value: number): string {
  const seconds = Math.floor(value / 1_000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatActivityTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "Remote activity";
  }
  return new Date(timestamp).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function assertNever(value: never): never {
  throw new Error(`Unexpected remote activity variant: ${String(value)}`);
}
