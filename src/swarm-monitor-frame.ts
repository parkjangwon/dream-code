import { withHiddenCursor } from "./terminal-frame.js";

export type SwarmMonitorFrame = {
  readonly text: string;
  readonly lineCount: number;
};

export function formatSwarmMonitorFrame(
  snapshot: string,
  previousLineCount: number,
  terminalRows: number | undefined,
): SwarmMonitorFrame {
  const lineCount = countLines(snapshot);
  const prefix = terminalRows === undefined
    ? clearPreviousSnapshot(previousLineCount)
    : formatAnchoredBottomRedraw(terminalRows, previousLineCount, lineCount);
  return { text: withHiddenCursor(`${prefix}${snapshot}`), lineCount };
}

function formatAnchoredBottomRedraw(rows: number, previousLineCount: number, nextLineCount: number): string {
  const clearLineCount = Math.max(previousLineCount, nextLineCount);
  if (!Number.isFinite(rows) || rows <= 0 || clearLineCount <= 0) {
    return "";
  }
  const boundedClearCount = Math.min(rows, clearLineCount);
  const clearStartRow = rows - boundedClearCount + 1;
  const nextStartRow = Math.max(1, rows - Math.min(rows, nextLineCount) + 1);
  const clears = Array.from(
    { length: boundedClearCount },
    (_item, index) => `\u001B[${clearStartRow + index};1H\r\u001B[2K`,
  ).join("");
  return `${clears}\u001B[${nextStartRow};1H`;
}

function clearPreviousSnapshot(lineCount: number): string {
  return lineCount === 0 ? "" : "\u001B[1A\r\u001B[2K".repeat(lineCount);
}

function countLines(text: string): number {
  return text.endsWith("\n") ? text.slice(0, -1).split("\n").length : text.split("\n").length;
}
