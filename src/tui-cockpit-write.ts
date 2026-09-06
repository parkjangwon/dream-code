import { withHiddenCursor } from "./terminal-frame.js";
import { isTermuxRuntime } from "./terminal-environment.js";
import { queryTerminalRows, type CursorRowQuery } from "./terminal-cursor-query.js";
import type { CockpitFrame } from "./tui-cockpit.js";
import {
  clearRenderedInputViewSequence,
  cursorToFrameStartSequence,
  cursorToPromptSequence,
  renderedInputViewFromCockpit,
  terminalRowsForInputFrame,
  type RenderedInputView,
} from "./tui-input-frame.js";

export type CockpitWriteStreams = {
  readonly input: NodeJS.ReadStream;
  readonly output: NodeJS.WriteStream;
};

// On Termux, process.stdout.rows is unreliable — including for the visible
// viewport height once the on-screen keyboard/extra-keys row eats into it — so
// absolute row addressing built on it can point past the terminal's real
// bottom edge. Writing at or beyond that edge scrolls the terminal, which
// invalidates the fixed row math for the very write that's happening, and
// stacks frames downward one render at a time. Confirming the real height via
// CPR (move to an unreachable corner, then ask where the cursor actually
// landed) keeps the same bottom-anchored math this file already uses on
// non-Termux terminals correct here too.
export async function writeCockpitFrame(
  streams: CockpitWriteStreams,
  frame: CockpitFrame,
  previousFrame: RenderedInputView | undefined,
  cursorRowQuery: CursorRowQuery | undefined,
): Promise<RenderedInputView> {
  const { input, output } = streams;

  if (isTermuxRuntime() && cursorRowQuery !== undefined) {
    const confirmedRows = await queryTerminalRows(input, output, cursorRowQuery);
    if (confirmedRows !== undefined) {
      const renderedFrame = renderedInputViewFromCockpit(frame, confirmedRows);
      output.write(withHiddenCursor([
        clearRenderedInputViewSequence(previousFrame),
        cursorToFrameStartSequence(frame.lines.length, confirmedRows),
        frame.lines.join("\n"),
        cursorToPromptSequence(frame, confirmedRows),
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
