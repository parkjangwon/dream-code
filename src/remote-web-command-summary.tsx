import { h } from "preact";
import { useEffect, useState } from "preact/hooks";

import type { CommandRecord, CommandStatus } from "./remote-web-api.js";

export function CommandOutcomeSummary(props: {
  readonly command: CommandRecord;
  readonly onRetry: (command: CommandRecord) => void;
}) {
  if (isActive(props.command)) {
    return <CommandFreshness command={props.command} />;
  }
  return (
    <section class={`command-outcome ${props.command.status}`} aria-label="Command outcome">
      <div class="outcome-copy">
        <strong>{outcomeTitle(props.command.status)}</strong>
        <small>{outcomeDetail(props.command)}</small>
      </div>
      <div class="outcome-metrics" aria-label="Run summary">
        <span>{props.command.activity.length} steps</span>
        <span>{formatElapsed(props.command.durationMs ?? 0)}</span>
        <span>{outputLineCount(props.command)} lines</span>
      </div>
      {canRetry(props.command.status) ? (
        <button class="retry-command" type="button" onClick={() => props.onRetry(props.command)}>Retry command</button>
      ) : null}
    </section>
  );
}

export function CommandFreshness(props: { readonly command: CommandRecord }) {
  const now = useNow(true);
  const age = elapsedMs(props.command.updatedAt, now);
  const stale = age > 15_000;
  return (
    <div class={`command-freshness ${stale ? "stale-command" : ""}`} aria-label="Command connection freshness">
      <span>{stale ? "Reconnecting" : "Last update"} · {formatElapsed(age)}</span>
    </div>
  );
}

function outcomeTitle(status: CommandStatus): string {
  switch (status) {
    case "done":
      return "Result ready";
    case "failed":
      return "Needs attention";
    case "cancelled":
      return "Stopped";
    case "queued":
    case "running":
      return "Working";
    default:
      return assertNever(status);
  }
}

function outcomeDetail(command: CommandRecord): string {
  if (command.error !== undefined) {
    return command.error;
  }
  switch (command.status) {
    case "done":
      return "Process stayed attached and the final answer is below.";
    case "failed":
      return "Review the last step, then retry when ready.";
    case "cancelled":
      return "The remote run was cancelled before completion.";
    case "queued":
    case "running":
      return "Dream Code is still working.";
    default:
      return assertNever(command.status);
  }
}

function canRetry(status: CommandStatus): boolean {
  return status === "failed" || status === "cancelled";
}

function outputLineCount(command: CommandRecord): number {
  const text = command.error ?? command.output;
  return text.trim().length === 0 ? 0 : text.trim().split(/\r?\n/u).length;
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

function isActive(command: CommandRecord): boolean {
  return command.status === "queued" || command.status === "running";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled command outcome: ${String(value)}`);
}
