import { maxVisibleSwarmLanesForViewport, swarmMonitorWindowOption } from "./swarm-monitor-window.js";

export function monitorNowOption(now: (() => number) | undefined): { readonly now?: () => number } {
  return now === undefined ? {} : { now };
}

export function monitorColumnsOption(columns: number | undefined): { readonly terminalColumns?: number } {
  return columns === undefined ? {} : { terminalColumns: columns };
}

export function monitorColumnsProviderOption(
  provider: (() => number | undefined) | undefined,
): { readonly terminalColumnsProvider?: () => number | undefined } {
  return provider === undefined ? {} : { terminalColumnsProvider: provider };
}

export function monitorAnchorRowOption(anchorRow: number | undefined): { readonly anchorRow?: number } {
  return anchorRow === undefined ? {} : { anchorRow };
}

export function monitorAnchorRowProviderOption(
  provider: (() => number | undefined) | undefined,
): { readonly anchorRowProvider?: () => number | undefined } {
  return provider === undefined ? {} : { anchorRowProvider: provider };
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

export function monitorWindowProviderOption(
  viewportRowsProvider: (() => number | undefined) | undefined,
  replaceMonitor: boolean | undefined,
): { readonly maxVisibleLanesProvider?: () => number | undefined } {
  if (replaceMonitor !== true || viewportRowsProvider === undefined) {
    return {};
  }
  return {
    maxVisibleLanesProvider: () => {
      const rows = viewportRowsProvider();
      return rows === undefined ? undefined : maxVisibleSwarmLanesForViewport(rows);
    },
  };
}
