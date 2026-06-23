import {
  renderSwarmMonitorSnapshot,
  type SwarmMonitorLane,
  type SwarmMonitorView,
  type SwarmSynthesisStatus,
} from "./swarm-monitor-render.js";
import { createSwarmMonitorKeyController } from "./swarm-monitor-keys.js";
import {
  effectiveSelectedIndex,
  hasLiveActivity,
  isAbortArmed,
  type MutableLaneState,
  updateFinishedLane,
  updateLane,
  wrapIndex,
} from "./swarm-monitor-state.js";
import type { SwarmLane } from "./swarm-plan.js";
import { clearPreviousFrame, withHiddenCursor } from "./terminal-frame.js";

export type SwarmMonitor = {
  readonly start: () => void;
  readonly laneStarted: (laneId: string) => void;
  readonly laneProgress: (laneId: string, characters: number, preview?: string) => void;
  readonly laneDone: (laneId: string, characters: number, preview?: string) => void;
  readonly laneFailed: (laneId: string, characters: number, preview?: string) => void;
  readonly laneCancelled: (laneId: string, characters: number, preview?: string) => void;
  readonly synthesisStarted: () => void;
  readonly synthesisDone: () => void;
  readonly synthesisFailed: () => void;
  readonly synthesisCancelled: () => void;
  readonly stop: () => void;
};

type MonitorOptions = {
  readonly goal: string;
  readonly lanes: readonly SwarmLane[];
  readonly write: (text: string) => void;
  readonly replaceInPlace?: boolean;
  readonly interactive?: boolean;
  readonly onAbort?: () => void;
  readonly maxVisibleLanes?: number;
  readonly terminalColumns?: number;
  readonly now?: () => number;
};

const progressRenderStep = 512;
const animationIntervalMs = 250;

export function createSwarmMonitor(options: MonitorOptions): SwarmMonitor {
  const now = options.now ?? Date.now;
  const startedAt = now();
  let synthesisStatus: SwarmSynthesisStatus = "waiting";
  let synthesisStartedAt: number | undefined;
  let synthesisFinishedAt: number | undefined;
  let renderedSnapshot = "";
  let frame = 0;
  let selectedIndex: number | undefined;
  let view: SwarmMonitorView = "monitor";
  let animationTimer: ReturnType<typeof setInterval> | undefined;
  let abortArmedAt: number | undefined;
  const state = new Map<string, MutableLaneState>(options.lanes.map((lane) => [lane.id, {
    status: "queued",
    characters: 0,
    preview: "",
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
      selectedIndex: effectiveSelectedIndex(options.lanes, state, selectedIndex),
      view,
      interactive: options.interactive === true,
      abortArmed: isAbortArmed(abortArmedAt, now()),
      maxVisibleLanes: options.maxVisibleLanes,
      synthesisStatus,
      synthesisStartedAt,
      synthesisFinishedAt,
    });
    if (options.replaceInPlace === true) {
      options.write(withHiddenCursor(`${clearPreviousFrame(renderedSnapshot, options.terminalColumns)}${snapshot}`));
      renderedSnapshot = snapshot;
      return;
    }
    options.write(snapshot);
  };
  const moveSelection = (direction: number): void => {
    const current = effectiveSelectedIndex(options.lanes, state, selectedIndex);
    if (current === undefined || options.lanes.length === 0) {
      return;
    }
    selectedIndex = wrapIndex(current + direction, options.lanes.length);
    render();
  };
  const openDetail = (): void => {
    const current = effectiveSelectedIndex(options.lanes, state, selectedIndex);
    if (current === undefined) {
      return;
    }
    selectedIndex = current;
    view = "detail";
    render();
  };
  const closeDetail = (): void => {
    if (view !== "detail") {
      return;
    }
    view = "monitor";
    render();
  };
  const escape = (): void => {
    if (view === "detail") {
      closeDetail();
      return;
    }
    const current = now();
    if (isAbortArmed(abortArmedAt, current)) {
      options.onAbort?.();
      return;
    }
    abortArmedAt = current;
    render();
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
  const keys = createSwarmMonitorKeyController(options.interactive === true, {
    moveSelection,
    openDetail,
    escape,
    abort: () => options.onAbort?.(),
  });
  const stop = (): void => {
    if (animationTimer !== undefined) {
      clearInterval(animationTimer);
      animationTimer = undefined;
    }
    keys.stop();
  };

  return {
    start: () => {
      render();
      keys.start();
    },
    laneStarted: (laneId) => {
      updateLane(state, laneId, (lane) => {
        lane.status = "running";
        lane.startedAt = now();
      });
      render();
      syncAnimation();
    },
    laneProgress: (laneId, characters, preview) => {
      const shouldRender = updateLane(state, laneId, (lane) => {
        lane.characters = Math.max(lane.characters, characters);
        if (preview !== undefined) {
          lane.preview = preview;
        }
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
    laneDone: (laneId, characters, preview) => {
      updateLane(state, laneId, (lane) => {
        lane.status = "done";
        lane.characters = Math.max(lane.characters, characters);
        if (preview !== undefined) {
          lane.preview = preview;
        }
        lane.finishedAt = now();
      });
      render();
      syncAnimation();
    },
    laneFailed: (laneId, characters, preview) => {
      updateFinishedLane(state, laneId, "failed", characters, preview, now());
      render();
      syncAnimation();
    },
    laneCancelled: (laneId, characters, preview) => {
      updateFinishedLane(state, laneId, "cancelled", characters, preview, now());
      render();
      syncAnimation();
    },
    synthesisStarted: () => {
      synthesisStatus = "running";
      synthesisStartedAt = now();
      synthesisFinishedAt = undefined;
      render();
      syncAnimation();
    },
    synthesisDone: () => {
      synthesisStatus = "done";
      synthesisFinishedAt = now();
      render();
      syncAnimation();
    },
    synthesisFailed: () => {
      synthesisStatus = "failed";
      synthesisFinishedAt = now();
      render();
      syncAnimation();
    },
    synthesisCancelled: () => {
      synthesisStatus = "cancelled";
      synthesisFinishedAt = now();
      render();
      syncAnimation();
    },
    stop,
  };
}

function laneSnapshot(lane: SwarmLane, index: number, state: MutableLaneState | undefined): SwarmMonitorLane {
  return {
    id: lane.id,
    index,
    title: lane.title,
    status: state?.status ?? "queued",
    characters: state?.characters ?? 0,
    preview: state?.preview ?? "",
    startedAt: state?.startedAt,
    finishedAt: state?.finishedAt,
  };
}
