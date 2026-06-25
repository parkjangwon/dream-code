import { maxVisibleSwarmLanesForViewport, swarmMonitorWindowOption } from "./swarm-monitor-window.js";

export function monitorNowOption(now: (() => number) | undefined): { readonly now?: () => number } {
  return now === undefined ? {} : { now };
}

export function monitorColumnsOption(columns: number | undefined): { readonly terminalColumns?: number } {
  return columns === undefined ? {} : { terminalColumns: columns };
}

export function monitorAnchorRowOption(anchorRow: number | undefined): { readonly anchorRow?: number } {
  return anchorRow === undefined ? {} : { anchorRow };
}

export function monitorWindowOption(
  monitorRows: number | undefined,
  viewportRows: number | undefined,
  replaceMonitor: boolean | undefined,
): { readonly maxVisibleLanes?: number } {
  if (replaceMonitor !== true) {
    return {};
  }
  if (viewportRows !== undefined) {
    return { maxVisibleLanes: maxVisibleSwarmLanesForViewport(viewportRows) };
  }
  return swarmMonitorWindowOption(monitorRows, replaceMonitor);
}
