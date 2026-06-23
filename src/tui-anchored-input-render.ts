import { stdout as output } from "node:process";

import { withHiddenCursor } from "./terminal-frame.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import { inputViewport } from "./tui-input-viewport.js";
import { inputViewLines } from "./tui-input-render.js";
import type { InputState } from "./tui-input-state.js";

const inputBoxLineCount = 3;

export function anchoredInputViewLines(
  state: InputState,
  prompt: string,
  secret = false,
  statusLines: readonly string[] = [],
  aboveLines: readonly string[] = [],
  width = Math.max(64, output.columns ?? 80),
): readonly string[] {
  const baseLines = inputViewLines(state, prompt, secret, [], width);
  const inputBoxLines = baseLines.slice(0, inputBoxLineCount);
  const auxiliaryLines = baseLines.slice(inputBoxLineCount);
  return [
    ...aboveLines,
    ...auxiliaryLines,
    ...inputBoxLines,
    ...statusLines,
  ];
}

export function renderFixedPromptInputView(
  state: InputState,
  prompt: string,
  secret = false,
  statusLines: readonly string[] = [],
  aboveLines: readonly string[] = [],
  previousLineCount = 0,
): number {
  const width = Math.max(64, output.columns ?? 80);
  const rows = output.rows ?? 24;
  const lines = anchoredInputViewLines(state, prompt, secret, statusLines, aboveLines, width);
  const startRow = Math.max(1, rows - lines.length + 1);
  const promptWidth = terminalVisibleWidth(prompt);
  const viewport = inputViewport(state.text, state.cursor, Math.max(0, width - 4 - promptWidth));
  const promptRow = startRow + aboveLines.length + Math.max(0, inputViewLines(state, prompt, secret, [], width).length - inputBoxLineCount) + 1;
  output.write(withHiddenCursor([
    clearAnchoredInputArea(previousLineCount, rows),
    `\u001B[${startRow};1H`,
    lines.join("\n"),
    `\u001B[${promptRow};${3 + promptWidth + viewport.cursorColumn}H`,
  ].join("")));
  return lines.length;
}

function clearAnchoredInputArea(previousLineCount: number, rows: number): string {
  if (previousLineCount === 0) {
    return "";
  }
  const startRow = Math.max(1, rows - previousLineCount + 1);
  let sequence = "";
  for (let row = startRow; row <= rows; row += 1) {
    sequence = `${sequence}\u001B[${row};1H\r\u001B[2K`;
  }
  return sequence;
}
