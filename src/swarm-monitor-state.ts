import type {
  SwarmLaneStatus,
  SwarmSynthesisStatus,
} from "./swarm-monitor-render.js";
import type { SwarmLane } from "./swarm-plan.js";

export type MutableLaneState = {
  status: SwarmLaneStatus;
  characters: number;
  preview: string;
  startedAt: number | undefined;
  finishedAt: number | undefined;
  lastRenderedCharacters: number;
};

export const escapeAbortWindowMs = 1_500;

export function wrapIndex(index: number, length: number): number {
  if (index < 1) {
    return length;
  }
  if (index > length) {
    return 1;
  }
  return index;
}

export function updateLane(
  state: Map<string, MutableLaneState>,
  laneId: string,
  update: (lane: MutableLaneState) => boolean | void,
): boolean {
  const lane = state.get(laneId);
  return lane === undefined ? false : update(lane) === true;
}

export function updateFinishedLane(
  state: Map<string, MutableLaneState>,
  laneId: string,
  status: "failed" | "cancelled",
  characters: number,
  preview: string | undefined,
  finishedAt: number,
): void {
  updateLane(state, laneId, (lane) => {
    lane.status = status;
    lane.characters = Math.max(lane.characters, characters);
    if (preview !== undefined) {
      lane.preview = preview;
    }
    lane.finishedAt = finishedAt;
  });
}

export function hasLiveActivity(
  state: ReadonlyMap<string, MutableLaneState>,
  synthesisStatus: SwarmSynthesisStatus,
): boolean {
  return synthesisStatus === "running" || [...state.values()].some((lane) => lane.status === "running");
}

export function isAbortArmed(armedAt: number | undefined, now: number): boolean {
  return armedAt !== undefined && now - armedAt <= escapeAbortWindowMs;
}

export function effectiveSelectedIndex(
  lanes: readonly SwarmLane[],
  state: ReadonlyMap<string, MutableLaneState>,
  selectedIndex: number | undefined,
): number | undefined {
  return selectedIndex ?? autoFollowIndex(lanes, state);
}

function autoFollowIndex(
  lanes: readonly SwarmLane[],
  state: ReadonlyMap<string, MutableLaneState>,
): number | undefined {
  for (let index = lanes.length - 1; index >= 0; index -= 1) {
    const lane = lanes[index];
    if (lane !== undefined && state.get(lane.id)?.status === "running") {
      return index + 1;
    }
  }
  for (let index = lanes.length - 1; index >= 0; index -= 1) {
    const lane = lanes[index];
    if (lane !== undefined && state.get(lane.id)?.status === "queued") {
      return index + 1;
    }
  }
  return lanes.length === 0 ? undefined : lanes.length;
}
