import type { CockpitFrame } from "./tui-cockpit.js";

export type RenderedInputView = {
  readonly lineCount: number;
  readonly promptLineIndex: number;
  readonly promptCursorColumn: number;
  readonly terminalRows: number | undefined;
};

export function renderedInputViewFromCockpit(
  frame: CockpitFrame,
  terminalRows: number | undefined,
): RenderedInputView {
  return {
    lineCount: frame.lines.length,
    promptLineIndex: frame.promptLineIndex,
    promptCursorColumn: frame.promptCursorColumn,
    terminalRows,
  };
}

export function clearRenderedInputViewSequence(frame: RenderedInputView | undefined): string {
  if (frame === undefined || frame.lineCount === 0) {
    return "";
  }

  const absoluteStart = frameStartRow(frame.lineCount, frame.terminalRows);
  if (absoluteStart !== undefined) {
    return `${cursorToRow(absoluteStart)}${clearRowsFromCurrentPosition(frame.lineCount)}`;
  }

  return clearRenderedPromptAnchoredFrameSequence(frame);
}

export function cursorToFrameStartSequence(lineCount: number, terminalRows: number | undefined): string {
  const row = frameStartRow(lineCount, terminalRows);
  return row === undefined ? "" : cursorToRow(row);
}

export function cursorToPromptSequence(frame: CockpitFrame, terminalRows: number | undefined): string {
  const startRow = frameStartRow(frame.lines.length, terminalRows);
  if (startRow !== undefined) {
    return `${cursorToRow(startRow + frame.promptLineIndex)}${cursorToColumn(frame.promptCursorColumn)}`;
  }

  let sequence = "";
  if (frame.promptRowOffsetFromBottom > 0) {
    sequence = `${sequence}\u001B[${frame.promptRowOffsetFromBottom}A`;
  }
  return `${sequence}\r${cursorToColumn(frame.promptCursorColumn)}`;
}

function clearRenderedPromptAnchoredFrameSequence(frame: RenderedInputView): string {
  let sequence = "\r";
  if (frame.promptLineIndex > 0) {
    sequence = `${sequence}\u001B[${frame.promptLineIndex}A\r`;
  }
  return `${sequence}${clearRowsFromCurrentPosition(frame.lineCount)}`;
}

function clearRowsFromCurrentPosition(lineCount: number): string {
  let sequence = "";
  for (let index = 0; index < lineCount; index += 1) {
    sequence = `${sequence}\u001B[2K`;
    if (index < lineCount - 1) {
      sequence = `${sequence}\u001B[1B\r`;
    }
  }

  if (lineCount > 1) {
    sequence = `${sequence}\u001B[${lineCount - 1}A\r`;
  }
  return sequence;
}

function frameStartRow(lineCount: number, terminalRows: number | undefined): number | undefined {
  if (terminalRows === undefined || terminalRows < lineCount) {
    return undefined;
  }
  return terminalRows - lineCount + 1;
}

function cursorToRow(row: number): string {
  return `\u001B[${row};1H`;
}

function cursorToColumn(columns: number): string {
  return columns > 0 ? `\u001B[${columns}C` : "";
}
