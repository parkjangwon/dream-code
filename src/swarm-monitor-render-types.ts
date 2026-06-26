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
