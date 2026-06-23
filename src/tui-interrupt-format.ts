import { ansi, paint } from "./ansi.js";
import type { InputState } from "./tui-input-state.js";

export function interruptHint(label: string, style: string): string {
  return `${paint(".......", ansi.accent)}  ${paint(label, style)}\n`;
}

export function formatGuardedRunningOutput(text: string, _state: InputState, inputLineCount: number, rows?: number): string {
  const boundary = text.endsWith("\n") || text.endsWith("\r") ? "" : "\n";
  return `${formatOutputCursor(rows, inputLineCount)}${text}${boundary}`;
}

export function formatActivateRunningInputRegion(rows: number | undefined, inputLineCount: number): string {
  const region = runningInputRegion(rows, inputLineCount);
  return region === undefined ? "" : `\u001B[1;${region.outputRow}r\u001B[${region.outputRow};1H`;
}

export function formatDeactivateRunningInputRegion(): string {
  return "\u001B[r";
}

export function formatClearRunningInput(rows: number | undefined, inputLineCount: number): string {
  if (rows === undefined || inputLineCount === 0) {
    return "\r\u001B[2K";
  }
  const startRow = Math.max(1, rows - inputLineCount + 1);
  let sequence = "";
  for (let row = startRow; row <= rows; row += 1) {
    sequence = `${sequence}\u001B[${row};1H\r\u001B[2K`;
  }
  return sequence;
}

function formatOutputCursor(rows: number | undefined, inputLineCount: number): string {
  const region = runningInputRegion(rows, inputLineCount);
  return region === undefined ? "\r\u001B[2K" : `\u001B[${region.outputRow};1H`;
}

function runningInputRegion(rows: number | undefined, inputLineCount: number): { readonly outputRow: number } | undefined {
  if (rows === undefined || rows < 4 || inputLineCount === 0) {
    return undefined;
  }
  const outputRow = rows - inputLineCount;
  return outputRow < 1 ? undefined : { outputRow };
}
