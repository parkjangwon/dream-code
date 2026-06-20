import {
  renderSwarmMonitorSnapshot,
  type SwarmLaneStatus,
  type SwarmMonitorLane,
  type SwarmSynthesisStatus,
} from "./swarm-monitor-render.js";
import type { SwarmLane } from "./swarm-plan.js";

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
  readonly replaceInPlace?: boolean;
  readonly now?: () => number;
};

const progressRenderStep = 512;
const animationIntervalMs = 250;

export function createSwarmMonitor(options: MonitorOptions): SwarmMonitor {
  const now = options.now ?? Date.now;
  const startedAt = now();
  let synthesisStatus: SwarmSynthesisStatus = "waiting";
  let renderedLineCount = 0;
  let frame = 0;
  let animationTimer: ReturnType<typeof setInterval> | undefined;
  const state = new Map<string, MutableLaneState>(options.lanes.map((lane) => [lane.id, {
    status: "queued",
    characters: 0,
    startedAt: undefined,
    finishedAt: undefined,
    lastRenderedCharacters: 0,
  }]));
  const render = (): void => {
    frame += 1;
    const snapshot = renderSwarmMonitorSnapshot({
      goal: options.goal,
      startedAt,
      now: now(),
      frame,
      lanes: options.lanes.map((lane, index) => laneSnapshot(lane, index + 1, state.get(lane.id))),
      synthesisStatus,
    });
    if (options.replaceInPlace === true) {
      options.write(`${clearPreviousSnapshot(renderedLineCount)}${snapshot}`);
      renderedLineCount = countLines(snapshot);
      return;
    }
    options.write(snapshot);
  };
  const syncAnimation = (): void => {
    if (options.replaceInPlace !== true) {
      return;
    }
    const live = hasLiveActivity(state, synthesisStatus);
    if (live && animationTimer === undefined) {
      animationTimer = setInterval(render, animationIntervalMs);
      animationTimer.unref();
      return;
    }
    if (!live && animationTimer !== undefined) {
      clearInterval(animationTimer);
      animationTimer = undefined;
    }
  };

  return {
    start: render,
    laneStarted: (laneId) => {
      updateLane(state, laneId, (lane) => {
        lane.status = "running";
        lane.startedAt = now();
      });
      render();
      syncAnimation();
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
      syncAnimation();
    },
    laneFailed: (laneId, characters) => {
      updateLane(state, laneId, (lane) => {
        lane.status = "failed";
        lane.characters = Math.max(lane.characters, characters);
        lane.finishedAt = now();
      });
      render();
      syncAnimation();
    },
    synthesisStarted: () => {
      synthesisStatus = "running";
      render();
      syncAnimation();
    },
    synthesisDone: () => {
      synthesisStatus = "done";
      render();
      syncAnimation();
    },
    synthesisFailed: () => {
      synthesisStatus = "failed";
      render();
      syncAnimation();
    },
  };
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

function updateLane(state: Map<string, MutableLaneState>, laneId: string, update: (lane: MutableLaneState) => boolean | void): boolean {
  const lane = state.get(laneId);
  return lane === undefined ? false : update(lane) === true;
}

function hasLiveActivity(state: ReadonlyMap<string, MutableLaneState>, synthesisStatus: SwarmSynthesisStatus): boolean {
  return synthesisStatus === "running" || [...state.values()].some((lane) => lane.status === "running");
}

function clearPreviousSnapshot(lineCount: number): string {
  return lineCount === 0 ? "" : "\u001B[1A\r\u001B[2K".repeat(lineCount);
}

function countLines(text: string): number {
  return text.endsWith("\n") ? text.slice(0, -1).split("\n").length : text.split("\n").length;
}
