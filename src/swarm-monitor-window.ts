import { cockpitReservedRows } from "./tui-cockpit.js";

export type SwarmMonitorWindowOption = {
  readonly maxVisibleLanes?: number;
};

const fallbackTerminalRows = 24;
const monitorChromeRows = 10;
const minimumVisibleLanes = 4;
const maximumVisibleLanes = 16;

export function swarmMonitorWindowOption(
  terminalRows: number | undefined,
  replaceInPlace: boolean | undefined,
): SwarmMonitorWindowOption {
  if (replaceInPlace !== true) {
    return {};
  }
  return { maxVisibleLanes: maxVisibleSwarmLanes(terminalRows) };
}

export function maxVisibleSwarmLanes(terminalRows: number | undefined): number {
  const rows = terminalRows ?? fallbackTerminalRows;
  const viewportRows = Math.max(0, rows - cockpitReservedRows);
  return maxVisibleSwarmLanesForViewport(viewportRows);
}

export function maxVisibleSwarmLanesForViewport(viewportRows: number): number {
  const budget = Math.max(minimumVisibleLanes, viewportRows - monitorChromeRows);
  return Math.min(maximumVisibleLanes, budget);
}
