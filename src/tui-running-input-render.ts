import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import { withHiddenCursor } from "./terminal-frame.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import { renderCockpitFrame } from "./tui-cockpit.js";
import {
  clearRenderedInputViewSequence,
  cursorToFrameStartSequence,
  cursorToRenderedPromptSequence,
  cursorToPromptSequence,
  renderedInputViewFromCockpit,
  type RenderedInputView,
} from "./tui-input-frame.js";
import { inputViewport } from "./tui-input-viewport.js";
import type { InputState } from "./tui-input-state.js";
import { renderInputText } from "./tui-input-render.js";

export function renderRunningInputView(
  state: InputState,
  queueCount: number,
  feedback: string,
  statusLines: readonly string[],
  previousFrame: RenderedInputView | undefined,
): RenderedInputView {
  const width = Math.max(64, output.columns ?? 80);
  const prompt = `${paint(`[queue ${queueCount}]`, ansi.blue)} ${paint(">", ansi.accent)} `;
  const promptWidth = terminalVisibleWidth(prompt);
  const viewport = inputViewport(state.text, state.cursor, Math.max(0, width - promptWidth));
  const frame = renderCockpitFrame({
    promptLine: `${prompt}${renderInputText(viewport.text, false)}`,
    promptCursorColumn: promptWidth + viewport.cursorColumn,
    width,
    auxiliaryLines: [
      paint(feedback.length === 0 ? "Enter queue · /steer now · /queue edit/rm/send · esc esc interrupt" : feedback, ansi.guide),
    ],
    footerLines: statusLines,
  });
  const renderedFrame = renderedInputViewFromCockpit(frame, output.rows);
  output.write(withHiddenCursor([
    clearRenderedInputViewSequence(previousFrame),
    cursorToFrameStartSequence(frame.lines.length, output.rows),
    frame.lines.join("\n"),
    cursorToPromptSequence(frame, output.rows),
  ].join("")));
  return renderedFrame;
}

export function runningInputCursorSequence(frame: RenderedInputView | undefined): string {
  const sequence = cursorToRenderedPromptSequence(frame);
  return sequence.length === 0 ? "" : `${sequence}\u001B[?25h`;
}
