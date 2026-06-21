import { ansi, paint } from "./ansi.js";
import { brailleActivity, brailleProgressBar } from "./braille-ui.js";
import { terminalVisibleWidth } from "./terminal-width.js";

export type SwarmLaneStatus = "queued" | "running" | "done" | "failed" | "cancelled";
export type SwarmSynthesisStatus = "waiting" | "running" | "done" | "failed" | "cancelled";

export type SwarmMonitorLane = {
  readonly id: string;
  readonly index: number;
  readonly title: string;
  readonly status: SwarmLaneStatus;
  readonly characters: number;
  readonly preview: string;
  readonly startedAt: number | undefined;
  readonly finishedAt: number | undefined;
};

export type SwarmMonitorView = "monitor" | "detail";

export type SwarmMonitorSnapshot = {
  readonly goal: string;
  readonly startedAt: number;
  readonly now: number;
  readonly frame: number;
  readonly lanes: readonly SwarmMonitorLane[];
  readonly selectedIndex: number | undefined;
  readonly view: SwarmMonitorView;
  readonly interactive: boolean;
  readonly abortArmed: boolean;
  readonly maxVisibleLanes: number | undefined;
  readonly synthesisStatus: SwarmSynthesisStatus;
  readonly synthesisStartedAt: number | undefined;
  readonly synthesisFinishedAt: number | undefined;
};

export function renderSwarmMonitorSnapshot(snapshot: SwarmMonitorSnapshot): string {
  if (snapshot.view === "detail") {
    return renderLaneDetail(snapshot);
  }
  const completed = snapshot.lanes.filter((lane) => lane.status === "done").length;
  const active = snapshot.lanes.filter((lane) => lane.status === "running").length;
  const showActivity = active > 0 || snapshot.synthesisStatus === "running";
  const laneWindow = visibleLaneWindow(snapshot);
  const lines = [
    `${paint("╭─ Swarm Monitor", ansi.accent)} ${paint(`${active} active`, ansi.bold)} ${paint("·", ansi.guide)} ${completed}/${snapshot.lanes.length} done ${paint("·", ansi.guide)} ${formatDuration(snapshot.now - snapshot.startedAt)}`,
    `${paint("│", ansi.guide)} goal ${paint(truncate(snapshot.goal, 72), ansi.blue)}`,
    ...(showActivity ? [`${paint("│", ansi.guide)} activity ${activityStrip(snapshot.frame)} ${paint("parallel lanes mixing", ansi.dim)}`] : []),
    ...laneWindowLines(laneWindow, snapshot),
    `${paint("│", ansi.guide)} synthesis ${formatSynthesis(snapshot)}`,
    `${paint("╰─", ansi.accent)} ${footerText(snapshot.interactive, snapshot.abortArmed)}`,
  ];
  return `${lines.join("\n")}\n`;
}

type VisibleLaneWindow = {
  readonly lanes: readonly SwarmMonitorLane[];
  readonly before: number;
  readonly after: number;
};

function laneWindowLines(window: VisibleLaneWindow, snapshot: SwarmMonitorSnapshot): readonly string[] {
  return [
    ...(window.before > 0 ? [`${paint("│", ansi.guide)} ${paint(`↑ ${window.before} lanes above`, ansi.dim)}`] : []),
    ...window.lanes.map((lane) => renderLane(lane, snapshot.now, isSelected(snapshot, lane.index))),
    ...(window.after > 0 ? [`${paint("│", ansi.guide)} ${paint(`↓ ${window.after} lanes below`, ansi.dim)}`] : []),
  ];
}

function visibleLaneWindow(snapshot: SwarmMonitorSnapshot): VisibleLaneWindow {
  const max = snapshot.maxVisibleLanes;
  if (max === undefined || snapshot.lanes.length <= max) {
    return { lanes: snapshot.lanes, before: 0, after: 0 };
  }
  const visibleCount = Math.max(1, max);
  const anchor = anchorLaneIndex(snapshot);
  const start = clamp(anchor - Math.floor(visibleCount / 2), 0, snapshot.lanes.length - visibleCount);
  const end = start + visibleCount;
  return {
    lanes: snapshot.lanes.slice(start, end),
    before: start,
    after: snapshot.lanes.length - end,
  };
}

function anchorLaneIndex(snapshot: SwarmMonitorSnapshot): number {
  const selected = snapshot.selectedIndex === undefined ? undefined : snapshot.lanes.findIndex((lane) => lane.index === snapshot.selectedIndex);
  if (selected !== undefined && selected >= 0) {
    return selected;
  }
  const active = snapshot.lanes.findIndex((lane) => lane.status === "running");
  return active >= 0 ? active : 0;
}

function renderLane(lane: SwarmMonitorLane, now: number, selected: boolean): string {
  const duration = lane.startedAt === undefined ? "0.0s" : formatDuration((lane.finishedAt ?? now) - lane.startedAt);
  const marker = selected ? paint("›", ansi.accent) : paint("│", ansi.guide);
  return [
    marker,
    String(lane.index).padStart(2, "0"),
    statusLabel(lane.status),
    statusBar(lane.status),
    padVisible(truncate(lane.title, 24), 24),
    paint(duration.padStart(5), ansi.dim),
    paint(formatCharacters(lane.characters).padStart(10), ansi.guide),
  ].join(" ");
}

function renderLaneDetail(snapshot: SwarmMonitorSnapshot): string {
  const selectedLane = snapshot.lanes.find((lane) => lane.index === snapshot.selectedIndex);
  if (selectedLane === undefined) {
    return renderEmptyDetail(snapshot);
  }
  const duration = selectedLane.startedAt === undefined ? "0.0s" : formatDuration((selectedLane.finishedAt ?? snapshot.now) - selectedLane.startedAt);
  const previewLines = selectedLane.preview.trim().length === 0 ? [paint("No lane output yet.", ansi.dim)] : selectedLane.preview.trim().split(/\r?\n/u).slice(-6);
  const lines = [
    `${paint("╭─ Swarm Lane", ansi.accent)} ${String(selectedLane.index).padStart(2, "0")} ${paint(selectedLane.title, ansi.bold)}`,
    `${paint("│", ansi.guide)} status ${statusLabel(selectedLane.status)} ${paint("·", ansi.guide)} ${duration} ${paint("·", ansi.guide)} ${formatCharacters(selectedLane.characters)}`,
    `${paint("│", ansi.guide)} goal ${paint(truncate(snapshot.goal, 72), ansi.blue)}`,
    `${paint("│", ansi.guide)} latest`,
    ...previewLines.map((line) => `${paint("│", ansi.guide)} ${truncate(line, 96)}`),
    `${paint("╰─", ansi.accent)} ${paint("esc back", ansi.guide)} ${paint("·", ansi.guide)} ${paint("↑/↓ switch lane", ansi.guide)} ${paint("·", ansi.guide)} ${paint("ctrl+c stop", ansi.guide)}`,
  ];
  return `${lines.join("\n")}\n`;
}

function renderEmptyDetail(snapshot: SwarmMonitorSnapshot): string {
  const lines = [
    `${paint("╭─ Swarm Lane", ansi.accent)} ${paint("no lanes", ansi.dim)}`,
    `${paint("│", ansi.guide)} goal ${paint(truncate(snapshot.goal, 72), ansi.blue)}`,
    `${paint("╰─", ansi.accent)} ${paint("esc back", ansi.guide)}`,
  ];
  return `${lines.join("\n")}\n`;
}

function isSelected(snapshot: SwarmMonitorSnapshot, laneIndex: number): boolean {
  return snapshot.interactive && snapshot.selectedIndex === laneIndex;
}

function footerText(interactive: boolean, abortArmed: boolean): string {
  if (!interactive) {
    return paint("token mixing radar online", ansi.guide);
  }
  if (abortArmed) {
    return paint("esc again stop swarm · ctrl+c stop · token mixing radar online", ansi.yellow);
  }
  return paint("↑/↓ select lane · enter inspect · esc esc stop · ctrl+c stop · token mixing radar online", ansi.guide);
}

function statusLabel(status: SwarmLaneStatus): string {
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

function statusBar(status: SwarmLaneStatus): string {
  const bar = brailleProgressBar(status);
  switch (status) {
    case "queued":
      return paint(bar, ansi.guide);
    case "running":
      return paint(bar, ansi.accent);
    case "done":
      return paint(bar, ansi.green);
    case "failed":
      return paint(bar, ansi.red);
    case "cancelled":
      return paint(bar, ansi.yellow);
    default:
      return assertNever(status);
  }
}

function activityStrip(frame: number): string {
  return paint(brailleActivity(frame, 8), ansi.accent);
}

function formatSynthesis(snapshot: SwarmMonitorSnapshot): string {
  const elapsed = synthesisElapsed(snapshot);
  const suffix = elapsed === undefined ? "" : ` ${paint(elapsed, ansi.dim)}`;
  switch (snapshot.synthesisStatus) {
    case "waiting":
      return paint("waiting for lanes", ansi.dim);
    case "running":
      return `${paint("merging parallel outputs", ansi.yellow)}${suffix}`;
    case "done":
      return `${paint("complete", ansi.green)}${suffix}`;
    case "failed":
      return `${paint("failed", ansi.red)}${suffix}`;
    case "cancelled":
      return `${paint("stopped", ansi.yellow)}${suffix}`;
    default:
      return assertNever(snapshot.synthesisStatus);
  }
}

function synthesisElapsed(snapshot: SwarmMonitorSnapshot): string | undefined {
  if (snapshot.synthesisStartedAt === undefined) {
    return undefined;
  }
  return formatDuration((snapshot.synthesisFinishedAt ?? snapshot.now) - snapshot.synthesisStartedAt);
}

function formatDuration(milliseconds: number): string {
  return `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`;
}

function formatCharacters(characters: number): string {
  return characters < 1000 ? `${characters} chars` : `${(characters / 1000).toFixed(1)}k chars`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function padVisible(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - terminalVisibleWidth(text)))}`;
}

function truncate(text: string, width: number): string {
  if (terminalVisibleWidth(text) <= width) {
    return text;
  }
  let output = "";
  for (const char of text) {
    if (terminalVisibleWidth(`${output}${char}…`) > width) {
      return `${output}…`;
    }
    output = `${output}${char}`;
  }
  return output;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected swarm monitor render state: ${String(value)}`);
}
