import { appendFileSync } from "node:fs";
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
  const debugLog = process.env["DREAM_CPR_DEBUG"];
  const log = (line: string): void => {
    if (debugLog !== undefined) {
      appendFileSync(debugLog, `${line}\n`);
    }
  };

  if (isTermuxRuntime() && cursorRowQuery !== undefined) {
    const confirmedRows = await queryTerminalRows(input, output, cursorRowQuery);
    log(`[write] confirmedRows=${confirmedRows} prevLineCount=${previousFrame?.lineCount} prevTerminalRows=${previousFrame?.terminalRows} newLineCount=${frame.lines.length}`);
    if (confirmedRows !== undefined) {
      const renderedFrame = renderedInputViewFromCockpit(frame, confirmedRows);
      const clearSeq = clearRenderedInputViewSequence(previousFrame);
      const startSeq = cursorToFrameStartSequence(frame.lines.length, confirmedRows);
      const promptSeq = cursorToPromptSequence(frame, confirmedRows);
      log(`[write] clearSeq=${JSON.stringify(clearSeq)} startSeq=${JSON.stringify(startSeq)} promptSeq=${JSON.stringify(promptSeq)}`);
      output.write(withHiddenCursor([
        clearSeq,
        startSeq,
        frame.lines.join("\n"),
        promptSeq,
      ].join("")));
      return renderedFrame;
    }
  } else {
    log(`[write] fallback isTermux=${isTermuxRuntime()} hasQuery=${cursorRowQuery !== undefined}`);
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
