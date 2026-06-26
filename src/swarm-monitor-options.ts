import type { SwarmLane } from "./swarm-plan.js";
import type { ResizeSubscriber } from "./tui-fullscreen.js";

export type MonitorOptions = {
  readonly goal: string;
  readonly lanes: readonly SwarmLane[];
  readonly write: (text: string) => void;
  readonly replaceInPlace?: boolean;
  readonly interactive?: boolean;
  readonly onAbort?: () => void;
  readonly maxVisibleLanes?: number;
  readonly maxVisibleLanesProvider?: () => number | undefined;
  readonly terminalColumns?: number;
  readonly terminalColumnsProvider?: () => number | undefined;
  readonly anchorRow?: number;
  readonly anchorRowProvider?: () => number | undefined;
  readonly onResize?: ResizeSubscriber;
  readonly now?: () => number;
};

export function dynamicNumber(
  fallback: number | undefined,
  provider: (() => number | undefined) | undefined,
): number | undefined {
  return provider?.() ?? fallback;
}
