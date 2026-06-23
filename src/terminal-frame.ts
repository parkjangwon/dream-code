import { terminalVisibleWidth } from "./terminal-width.js";

const hideCursor = "\u001B[?25l";
const showCursor = "\u001B[?25h";
const clearPreviousRow = "\u001B[1A\r\u001B[2K";

export function withHiddenCursor(frame: string): string {
  return `${hideCursor}${frame}${showCursor}`;
}

export function clearPreviousFrame(frame: string, terminalColumns: number | undefined): string {
  if (frame.length === 0) {
    return "";
  }
  return clearPreviousRow.repeat(renderedRowCount(frame, terminalColumns));
}

function renderedRowCount(frame: string, terminalColumns: number | undefined): number {
  const lines = frameLines(frame);
  if (terminalColumns === undefined || terminalColumns <= 0) {
    return lines.length;
  }
  return lines.reduce((total, line) => {
    return total + Math.max(1, Math.ceil(terminalVisibleWidth(line) / terminalColumns));
  }, 0);
}

function frameLines(frame: string): readonly string[] {
  return frame.endsWith("\n") ? frame.slice(0, -1).split("\n") : frame.split("\n");
}
