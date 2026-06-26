import type { SwarmMonitor } from "./swarm-monitor.js";
import { createSwarmMonitor } from "./swarm-monitor.js";
import {
  monitorAnchorRowOption,
  monitorAnchorRowProviderOption,
  monitorColumnsOption,
  monitorColumnsProviderOption,
  monitorNowOption,
  monitorWindowOption,
  monitorWindowProviderOption,
} from "./swarm-runner-options.js";
import type { SwarmLane } from "./swarm-plan.js";
import type { ResizeSubscriber } from "./tui-fullscreen.js";

export type SwarmMonitorRunOptions = {
  readonly goal: string;
  readonly write: (text: string) => void;
  readonly replaceMonitor?: boolean;
  readonly monitorRows?: number;
  readonly monitorColumns?: number;
  readonly monitorColumnsProvider?: () => number | undefined;
  readonly monitorAnchorRow?: number;
  readonly monitorAnchorRowProvider?: () => number | undefined;
  readonly monitorViewportRows?: number;
  readonly monitorViewportRowsProvider?: () => number | undefined;
  readonly resize?: ResizeSubscriber;
  readonly now?: () => number;
};

export function createAgentSwarmMonitor(
  options: SwarmMonitorRunOptions,
  lanes: readonly SwarmLane[],
  onAbort: () => void,
): SwarmMonitor {
  const sharedOptions = {
    goal: options.goal,
    lanes,
    write: options.write,
    onAbort,
    ...monitorNowOption(options.now),
    ...monitorColumnsOption(options.monitorColumns),
    ...monitorColumnsProviderOption(options.monitorColumnsProvider),
    ...monitorAnchorRowOption(options.monitorAnchorRow),
    ...monitorAnchorRowProviderOption(options.monitorAnchorRowProvider),
    ...monitorWindowOption(options.monitorRows, options.monitorViewportRows, options.replaceMonitor),
    ...monitorWindowProviderOption(options.monitorViewportRowsProvider, options.replaceMonitor),
    ...(options.resize === undefined ? {} : { onResize: options.resize }),
  };
  if (options.replaceMonitor === undefined) {
    return createSwarmMonitor(sharedOptions);
  }
  return createSwarmMonitor({
    ...sharedOptions,
    replaceInPlace: options.replaceMonitor,
    interactive: options.replaceMonitor === true,
  });
}
