import { h } from "preact";
import { useEffect, useState } from "preact/hooks";

import type { CommandRecord } from "./remote-web-api.js";

type ActivityLine = {
  readonly label: string;
  readonly detail: string;
};

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
  { label: "Preparing result", detail: "Final response will replace this progress log" },
] as const;

export function ActivityTimeline(props: { readonly command: CommandRecord }) {
  const now = useNow(isActive(props.command));
  const elapsed = elapsedMs(props.command.startedAt ?? props.command.createdAt, now);
  const lines = activityLines(props.command);
  const visibleCount = props.command.activity.length > 0
    ? lines.length
    : Math.min(lines.length, Math.max(1, Math.floor(elapsed / 3_000) + 1));
  return (
    <div class="activity" aria-label="Dream Code progress">
      <div class="activity-head">
        <span class="thinking-bars" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span>Working · {formatElapsed(elapsed)}</span>
      </div>
      <ol class="activity-list">
        {lines.slice(0, visibleCount).map((line, index) => (
          <li class={index === visibleCount - 1 ? "active" : "done"} key={line.label}>
            <span class="activity-dot" />
            <span>
              <strong>{line.label}</strong>
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
