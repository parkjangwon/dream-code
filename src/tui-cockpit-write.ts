import { withHiddenCursor } from "./terminal-frame.js";
import { isTermuxRuntime } from "./terminal-environment.js";
import type { CursorRowQuery } from "./terminal-cursor-query.js";
import type { CockpitFrame } from "./tui-cockpit.js";
import {
  clearRenderedInputViewAtRowSequence,
  clearRenderedInputViewSequence,
  cursorToFrameStartRowSequence,
  cursorToFrameStartSequence,
  cursorToPromptAtRowSequence,
  cursorToPromptSequence,
  renderedInputViewFromCockpit,
  terminalRowsForInputFrame,
  type RenderedInputView,
} from "./tui-input-frame.js";

export type CockpitWriteStreams = {
  readonly input: NodeJS.ReadStream;
  readonly output: NodeJS.WriteStream;
};

// On Termux, process.stdout.rows is unreliable, so redraws fall back to
// cursor-relative positioning. That fallback has no way to notice the terminal
// scrolled between renders (e.g. the frame grew a line), which drifts the redraw
// and stacks frames on screen. Asking the terminal directly where the cursor
// really is (CPR, `\x1b[6n`) sidesteps that drift by anchoring this redraw to a
// freshly confirmed absolute row instead of trusting the last assumed position.
export async function writeCockpitFrame(
  streams: CockpitWriteStreams,
  frame: CockpitFrame,
  previousFrame: RenderedInputView | undefined,
  cursorRowQuery: CursorRowQuery | undefined,
): Promise<RenderedInputView> {
  const { input, output } = streams;

  if (isTermuxRuntime() && previousFrame !== undefined && cursorRowQuery !== undefined) {
    const currentRow = await cursorRowQuery.queryRow(input, output);
    if (currentRow !== undefined) {
      const frameTopRow = currentRow - previousFrame.promptLineIndex;
      const renderedFrame = renderedInputViewFromCockpit(frame, undefined);
      output.write(withHiddenCursor([
        clearRenderedInputViewAtRowSequence(previousFrame, frameTopRow),
        cursorToFrameStartRowSequence(frameTopRow),
        frame.lines.join("\n"),
        cursorToPromptAtRowSequence(frame, frameTopRow),
      ].join("")));
      return renderedFrame;
    }
  }

  const terminalRows = terminalRowsForInputFrame(output.rows);
  const renderedFrame = renderedInputViewFromCockpit(frame, terminalRows);
  output.write(withHiddenCursor([
    clearRenderedInputViewSequence(previousFrame),
    cursorToFrameStartSequence(frame.lines.length, terminalRows),
    frame.lines.join("\n"),
    cursorToPromptSequence(frame, terminalRows),
  ].join("")));
  return renderedFrame;
}
