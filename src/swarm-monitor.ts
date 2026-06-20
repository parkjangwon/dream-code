import { ansi, paint } from "./ansi.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import type { SwarmLane } from "./swarm-plan.js";

export type SwarmLaneStatus = "queued" | "running" | "done" | "failed";
export type SwarmSynthesisStatus = "waiting" | "running" | "done" | "failed";

export type SwarmMonitorLane = {
  readonly id: string;
  readonly index: number;
  readonly title: string;
  readonly status: SwarmLaneStatus;
  readonly characters: number;
  readonly startedAt: number | undefined;
  readonly finishedAt: number | undefined;
};

export type SwarmMonitorSnapshot = {
  readonly goal: string;
  readonly startedAt: number;
  readonly now: number;
  readonly lanes: readonly SwarmMonitorLane[];
  readonly synthesisStatus: SwarmSynthesisStatus;
};

export type SwarmMonitor = {
  readonly start: () => void;
  readonly laneStarted: (laneId: string) => void;
  readonly laneProgress: (laneId: string, characters: number) => void;
  readonly laneDone: (laneId: string, characters: number) => void;
  readonly laneFailed: (laneId: string, characters: number) => void;
  readonly synthesisStarted: () => void;
  readonly synthesisDone: () => void;
  readonly synthesisFailed: () => void;
};

type MutableLaneState = {
  status: SwarmLaneStatus;
  characters: number;
  startedAt: number | undefined;
  finishedAt: number | undefined;
  lastRenderedCharacters: number;
};

type MonitorOptions = {
  readonly goal: string;
  readonly lanes: readonly SwarmLane[];
  readonly write: (text: string) => void;
  readonly now?: () => number;
};

const progressRenderStep = 512;

export function createSwarmMonitor(options: MonitorOptions): SwarmMonitor {
  const now = options.now ?? Date.now;
  const startedAt = now();
  let synthesisStatus: SwarmSynthesisStatus = "waiting";
  const state = new Map<string, MutableLaneState>(options.lanes.map((lane) => [lane.id, {
    status: "queued",
    characters: 0,
    startedAt: undefined,
    finishedAt: undefined,
    lastRenderedCharacters: 0,
  }]));
  const render = (): void => {
    options.write(renderSwarmMonitorSnapshot({
      goal: options.goal,
      startedAt,
      now: now(),
      lanes: options.lanes.map((lane, index) => laneSnapshot(lane, index + 1, state.get(lane.id))),
      synthesisStatus,
    }));
  };

  return {
    start: render,
    laneStarted: (laneId) => {
      updateLane(state, laneId, (lane) => {
        lane.status = "running";
        lane.startedAt = now();
      });
      render();
    },
    laneProgress: (laneId, characters) => {
      const shouldRender = updateLane(state, laneId, (lane) => {
        lane.characters = Math.max(lane.characters, characters);
        if (lane.characters - lane.lastRenderedCharacters < progressRenderStep) {
          return false;
        }
        lane.lastRenderedCharacters = lane.characters;
        return true;
      });
      if (shouldRender) {
        render();
      }
    },
    laneDone: (laneId, characters) => {
      updateLane(state, laneId, (lane) => {
        lane.status = "done";
        lane.characters = Math.max(lane.characters, characters);
        lane.finishedAt = now();
      });
      render();
    },
    laneFailed: (laneId, characters) => {
      updateLane(state, laneId, (lane) => {
        lane.status = "failed";
        lane.characters = Math.max(lane.characters, characters);
        lane.finishedAt = now();
      });
      render();
    },
    synthesisStarted: () => {
      synthesisStatus = "running";
      render();
    },
    synthesisDone: () => {
      synthesisStatus = "done";
      render();
    },
    synthesisFailed: () => {
      synthesisStatus = "failed";
      render();
    },
  };
}

export function renderSwarmMonitorSnapshot(snapshot: SwarmMonitorSnapshot): string {
  const completed = snapshot.lanes.filter((lane) => lane.status === "done").length;
  const active = snapshot.lanes.filter((lane) => lane.status === "running").length;
  const lines = [
    `${paint("╭─ Swarm Monitor", ansi.accent)} ${paint(`${active} active`, ansi.bold)} ${paint("·", ansi.guide)} ${completed}/${snapshot.lanes.length} done ${paint("·", ansi.guide)} ${formatDuration(snapshot.now - snapshot.startedAt)}`,
    `${paint("│", ansi.guide)} goal ${paint(truncate(snapshot.goal, 72), ansi.blue)}`,
    ...snapshot.lanes.map((lane) => renderLane(lane, snapshot.now)),
    `${paint("│", ansi.guide)} synthesis ${formatSynthesis(snapshot.synthesisStatus)}`,
    `${paint("╰─", ansi.accent)} ${paint("token mixing radar online", ansi.guide)}`,
  ];
  return `${lines.join("\n")}\n`;
}

function laneSnapshot(lane: SwarmLane, index: number, state: MutableLaneState | undefined): SwarmMonitorLane {
  return {
    id: lane.id,
    index,
    title: lane.title,
    status: state?.status ?? "queued",
    characters: state?.characters ?? 0,
    startedAt: state?.startedAt,
    finishedAt: state?.finishedAt,
  };
}

function renderLane(lane: SwarmMonitorLane, now: number): string {
  const label = statusLabel(lane.status);
  const duration = lane.startedAt === undefined ? "0.0s" : formatDuration((lane.finishedAt ?? now) - lane.startedAt);
  return [
    paint("│", ansi.guide),
    String(lane.index).padStart(2, "0"),
    label,
    statusBar(lane.status),
    padVisible(truncate(lane.title, 24), 24),
    paint(duration.padStart(5), ansi.dim),
    paint(formatCharacters(lane.characters).padStart(10), ansi.guide),
  ].join(" ");
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

function updateLane(state: Map<string, MutableLaneState>, laneId: string, update: (lane: MutableLaneState) => boolean | void): boolean {
  const lane = state.get(laneId);
  return lane === undefined ? false : update(lane) === true;
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
  throw new Error(`Unexpected swarm monitor state: ${String(value)}`);
}
