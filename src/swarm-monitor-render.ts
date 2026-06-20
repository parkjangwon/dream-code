import { ansi, paint } from "./ansi.js";
import { terminalVisibleWidth } from "./terminal-width.js";

export type SwarmLaneStatus = "queued" | "running" | "done" | "failed";
export type SwarmSynthesisStatus = "waiting" | "running" | "done" | "failed";

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
  readonly synthesisStatus: SwarmSynthesisStatus;
};

export function renderSwarmMonitorSnapshot(snapshot: SwarmMonitorSnapshot): string {
  if (snapshot.view === "detail") {
    return renderLaneDetail(snapshot);
  }
  const completed = snapshot.lanes.filter((lane) => lane.status === "done").length;
  const active = snapshot.lanes.filter((lane) => lane.status === "running").length;
  const showActivity = active > 0 || snapshot.synthesisStatus === "running";
  const lines = [
    `${paint("╭─ Swarm Monitor", ansi.accent)} ${paint(`${active} active`, ansi.bold)} ${paint("·", ansi.guide)} ${completed}/${snapshot.lanes.length} done ${paint("·", ansi.guide)} ${formatDuration(snapshot.now - snapshot.startedAt)}`,
    `${paint("│", ansi.guide)} goal ${paint(truncate(snapshot.goal, 72), ansi.blue)}`,
    ...(showActivity ? [`${paint("│", ansi.guide)} activity ${activityStrip(snapshot.frame)} ${paint("parallel lanes mixing", ansi.dim)}`] : []),
    ...snapshot.lanes.map((lane) => renderLane(lane, snapshot.now, isSelected(snapshot, lane.index))),
    `${paint("│", ansi.guide)} synthesis ${formatSynthesis(snapshot.synthesisStatus)}`,
    `${paint("╰─", ansi.accent)} ${footerText(snapshot.interactive)}`,
  ];
  return `${lines.join("\n")}\n`;
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
    `${paint("╰─", ansi.accent)} ${paint("esc back", ansi.guide)} ${paint("·", ansi.guide)} ${paint("↑/↓ switch lane", ansi.guide)}`,
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

function footerText(interactive: boolean): string {
  return interactive
    ? paint("↑/↓ select lane · enter inspect · esc back · token mixing radar online", ansi.guide)
    : paint("token mixing radar online", ansi.guide);
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
    default:
      return assertNever(status);
  }
}

function statusBar(status: SwarmLaneStatus): string {
  switch (status) {
    case "queued":
      return paint("░░░░░░░░", ansi.guide);
    case "running":
      return paint("▓▓▓▒▒░░░", ansi.accent);
    case "done":
      return paint("████████", ansi.green);
    case "failed":
      return paint("██░░░░░░", ansi.red);
    default:
      return assertNever(status);
  }
}

function activityStrip(frame: number): string {
  const cells = ["▱", "▰", "▰", "▱", "▱", "▱"] as const;
  const offset = frame % cells.length;
  const shifted = cells.map((_, index) => cells[(index + offset) % cells.length] ?? "▱").join("");
  return paint(shifted, ansi.accent);
}

function formatSynthesis(status: SwarmSynthesisStatus): string {
  switch (status) {
    case "waiting":
      return paint("waiting for lanes", ansi.dim);
    case "running":
      return paint("merging parallel outputs", ansi.yellow);
    case "done":
      return paint("complete", ansi.green);
    case "failed":
      return paint("failed", ansi.red);
    default:
      return assertNever(status);
  }
}

function formatDuration(milliseconds: number): string {
  return `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`;
}

function formatCharacters(characters: number): string {
  return characters < 1000 ? `${characters} chars` : `${(characters / 1000).toFixed(1)}k chars`;
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
