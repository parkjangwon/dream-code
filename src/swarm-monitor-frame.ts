import { clearFrameAtRow, clearPreviousFrame, cursorToRow, withHiddenCursor } from "./terminal-frame.js";

export type SwarmMonitorFrameOptions = {
  readonly replaceInPlace?: boolean;
  readonly write: (text: string) => void;
  readonly terminalColumns?: number;
  readonly terminalColumnsProvider?: () => number | undefined;
  readonly anchorRow?: number;
  readonly anchorRowProvider?: () => number | undefined;
};

export type SwarmMonitorFrame = {
  readonly render: (snapshot: string) => void;
};

export function createSwarmMonitorFrame(options: SwarmMonitorFrameOptions): SwarmMonitorFrame {
  let renderedSnapshot = "";
  let renderedAnchorRow: number | undefined;
  let renderedTerminalColumns: number | undefined;

  return {
    render: (snapshot) => {
      if (options.replaceInPlace !== true) {
        options.write(snapshot);
        return;
      }

      const terminalColumns = dynamicNumber(options.terminalColumns, options.terminalColumnsProvider);
      const anchorRow = dynamicNumber(options.anchorRow, options.anchorRowProvider);
      const clearColumns = renderedTerminalColumns ?? terminalColumns;
      const clearFrame = renderedAnchorRow === undefined
        ? clearPreviousFrame(renderedSnapshot, clearColumns)
        : clearFrameAtRow(renderedAnchorRow, renderedSnapshot, clearColumns);
      const anchoredFrame = anchorRow === undefined
        ? `${clearFrame}${snapshot}`
        : `${clearFrame}${cursorToRow(anchorRow)}${snapshot}`;

      options.write(withHiddenCursor(anchoredFrame));
      renderedSnapshot = snapshot;
      renderedAnchorRow = anchorRow;
      renderedTerminalColumns = terminalColumns;
    },
  };
}

function dynamicNumber(
  fallback: number | undefined,
  provider: (() => number | undefined) | undefined,
): number | undefined {
  return provider?.() ?? fallback;
}
