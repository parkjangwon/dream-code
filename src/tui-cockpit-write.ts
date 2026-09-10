import { withHiddenCursor } from "./terminal-frame.js";
import { isTermuxRuntime } from "./terminal-environment.js";
import { queryTerminalRows, type CursorRowQuery } from "./terminal-cursor-query.js";
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

// On this class of device, process.stdout.rows is not just wrong but actively
// unstable — the real terminal height itself swings wildly (observed: 56, then
// 31) between renders, apparently as the on-screen keyboard resizes the
// viewport while typing. Anchoring the redraw to "the confirmed total height"
// is therefore unstable by construction: the ground truth itself keeps
// changing. Anchoring instead to "where the cursor actually is right now"
// (CPR, `\x1b[6n`, relative to the previous frame's own recorded prompt row)
// sidesteps that entirely — our own prior write put the cursor there, and it
// doesn't move on its own just because the reported viewport height did.
export async function writeCockpitFrame(
  streams: CockpitWriteStreams,
  frame: CockpitFrame,
  previousFrame: RenderedInputView | undefined,
  cursorRowQuery: CursorRowQuery | undefined,
): Promise<RenderedInputView> {
  const { input, output } = streams;

  if (isTermuxRuntime() && cursorRowQuery !== undefined) {
    const anchorRow = previousFrame === undefined
      ? await queryTerminalRows(input, output, cursorRowQuery)
      : await cursorRowQuery.queryRow(input, output);
    if (anchorRow !== undefined) {
      const frameTopRow = previousFrame === undefined
        ? Math.max(1, anchorRow - frame.lines.length + 1)
        : Math.max(1, anchorRow - previousFrame.promptLineIndex);
      const renderedFrame = renderedInputViewFromCockpit(frame, undefined, frameTopRow);
      output.write(withHiddenCursor([
        // Clear at the PREVIOUS frame's own top row: when the CPR anchor
        // drifts (scroll cursor restore racing the query, keyboard resizes),
        // clearing at the new top row leaves the old dock behind and the
        // status bar appears duplicated.
        clearRenderedInputViewAtRowSequence(previousFrame, previousFrame?.frameTopRow ?? frameTopRow),
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
