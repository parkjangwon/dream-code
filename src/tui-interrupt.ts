import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents, type Key } from "node:readline";

import { ansi, paint } from "./ansi.js";
import { actionForKey, type InteractiveInputOptions } from "./tui-input.js";
import { inputViewLines, renderAnchoredInputView } from "./tui-input-render.js";
import { createInputState, reduceInputState, type InputState } from "./tui-input-state.js";
import { parseRunningCommand, type RunningCommand } from "./tui-running-command.js";

export type EscInterruptState = {
  readonly armedAt?: number;
};

export type EscInterruptUpdate = {
  readonly state: EscInterruptState;
  readonly effect: "arm" | "abort";
};

export const escInterruptWindowMs = 1_500;

export type RunningOutputWriter = (text: string) => void;
export type RunningStatusWriter = (lines: readonly string[]) => void;

export type EscInterruptOptions = {
  readonly input?: InteractiveInputOptions;
  readonly onRunningCommand?: (
    command: RunningCommand,
    write: RunningOutputWriter,
    setStatusLines: RunningStatusWriter,
  ) => Promise<void> | void;
};

export async function runWithEscInterrupt<T>(
  task: (signal: AbortSignal, write: RunningOutputWriter) => Promise<T>,
  options: EscInterruptOptions = {},
): Promise<T> {
  const controller = new AbortController();
  if (input.isTTY !== true || output.isTTY !== true) {
    return task(controller.signal, (text) => output.write(text));
  }

  let state: EscInterruptState = {};
  let inputState = createInputState(
    options.input?.history ?? [],
    options.input?.commands ?? [],
    options.input?.skills ?? [],
    {
      fileMentions: options.input?.fileMentions ?? [],
    },
  );
  let renderedInputLines = 0;
  let statusLines = options.input?.statusLines ?? [];
  let pendingCommand = Promise.resolve();
  const previousRawMode = input.isRaw;
  const writeInternal = (text: string): void => {
    output.write(text);
  };
  const writeGuardedOutput = (text: string): void => {
    writeInternal(formatGuardedRunningOutput(text, inputState, renderedInputLines, output.rows));
    renderInput();
  };
  const setStatusLines = (lines: readonly string[]): void => {
    statusLines = lines;
    renderInputWithRegion();
  };
  const renderInput = (): void => {
    renderedInputLines = renderAnchoredInputView(
      inputState,
      options.input?.prompt ?? "> ",
      options.input?.secret === true,
      statusLines,
      renderedInputLines,
    );
  };
  const renderInputWithRegion = (): void => {
    const previousLineCount = renderedInputLines;
    renderedInputLines = inputViewLines(
      inputState,
      options.input?.prompt ?? "> ",
      options.input?.secret === true,
      statusLines,
    ).length;
    activateRegion();
    renderedInputLines = renderAnchoredInputView(
      inputState,
      options.input?.prompt ?? "> ",
      options.input?.secret === true,
      statusLines,
      previousLineCount,
    );
  };
  const activateRegion = (): void => {
    writeInternal(formatActivateRunningInputRegion(output.rows, renderedInputLines));
  };
  const deactivateRegion = (): void => {
    writeInternal(formatDeactivateRunningInputRegion());
  };
  const onKeypress = (value: string | undefined, key: Key): void => {
    if (key.ctrl === true && key.name === "c") {
      writeGuardedOutput(interruptHint("interrupting agent run", ansi.red));
      controller.abort();
      return;
    }
    if (key.name === "escape") {
      const update = nextEscInterruptState(state, Date.now());
      state = update.state;
      if (update.effect === "arm") {
        writeGuardedOutput(interruptHint("esc again to interrupt", ansi.yellow));
        return;
      }
      writeGuardedOutput(interruptHint("interrupting agent run", ansi.red));
      controller.abort();
      return;
    }

    const action = actionForKey(value, key);
    if (action === undefined) {
      return;
    }
    const update = reduceInputState(inputState, action);
    inputState = update.state;
    switch (update.effect.kind) {
      case "none":
        renderInputWithRegion();
        return;
      case "submit":
        {
          const submittedText = update.effect.text;
          inputState = createInputState(inputState.history, inputState.commands, inputState.skills, {
            fileMentions: inputState.fileMentions,
          });
          renderInputWithRegion();
          pendingCommand = pendingCommand
            .then(async () => dispatchRunningCommand(
              parseRunningCommand(submittedText),
              options,
              controller,
              writeGuardedOutput,
              setStatusLines,
            ))
            .catch((error: unknown) => {
              writeGuardedOutput(interruptHint(error instanceof Error ? error.message : "running command failed", ansi.red));
            })
            .finally(() => {
              renderInputWithRegion();
            });
          return;
        }
      case "redraw":
        options.input?.redrawHeader();
        renderedInputLines = 0;
        renderInputWithRegion();
        return;
      case "cancel":
        writeGuardedOutput(interruptHint("interrupting agent run", ansi.red));
        controller.abort();
        return;
      default:
        return assertNever(update.effect);
    }
  };
  const onResize = (): void => {
    renderInputWithRegion();
  };

  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  input.on("keypress", onKeypress);
  output.on("resize", onResize);
  renderInputWithRegion();
  writeGuardedOutput(interruptHint("esc interrupt · type steering text · /status /agents /interrupt", ansi.guide));
  try {
    return await task(controller.signal, writeGuardedOutput);
  } finally {
    input.off("keypress", onKeypress);
    output.off("resize", onResize);
    await pendingCommand;
    writeInternal(formatClearRunningInput(output.rows, renderedInputLines));
    deactivateRegion();
    input.setRawMode(previousRawMode);
    input.pause();
  }
}

export function nextEscInterruptState(
  state: EscInterruptState,
  now: number,
  windowMs = escInterruptWindowMs,
): EscInterruptUpdate {
  if (state.armedAt !== undefined && now - state.armedAt <= windowMs) {
    return { state: {}, effect: "abort" };
  }
  return { state: { armedAt: now }, effect: "arm" };
}

function interruptHint(label: string, style: string): string {
  return `${paint(".......", ansi.accent)}  ${paint(label, style)}\n`;
}

async function dispatchRunningCommand(
  command: RunningCommand,
  options: EscInterruptOptions,
  controller: AbortController,
  write: RunningOutputWriter,
  setStatusLines: RunningStatusWriter,
): Promise<void> {
  if (command.kind === "ignore") {
    return;
  }
  if (command.kind === "interrupt") {
    write(interruptHint("interrupting agent run", ansi.red));
    controller.abort();
    return;
  }
  await options.onRunningCommand?.(command, write, setStatusLines);
  if (command.kind === "steer" && command.priority) {
    write(interruptHint("priority steering queued; interrupting current run", ansi.yellow));
    controller.abort();
  }
}

export function formatGuardedRunningOutput(text: string, _state: InputState, inputLineCount: number, rows?: number): string {
  const boundary = text.endsWith("\n") || text.endsWith("\r") ? "" : "\n";
  return `${formatOutputCursor(rows, inputLineCount)}${text}${boundary}`;
}

function formatActivateRunningInputRegion(rows: number | undefined, inputLineCount: number): string {
  const region = runningInputRegion(rows, inputLineCount);
  return region === undefined ? "" : `\u001B[1;${region.outputRow}r\u001B[${region.outputRow};1H`;
}

function formatDeactivateRunningInputRegion(): string {
  return "\u001B[r";
}

function formatOutputCursor(rows: number | undefined, inputLineCount: number): string {
  const region = runningInputRegion(rows, inputLineCount);
  return region === undefined ? "\r\u001B[2K" : `\u001B[${region.outputRow};1H`;
}

function formatClearRunningInput(rows: number | undefined, inputLineCount: number): string {
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

function runningInputRegion(rows: number | undefined, inputLineCount: number): { readonly outputRow: number } | undefined {
  if (rows === undefined || rows < 4 || inputLineCount === 0) {
    return undefined;
  }
  const outputRow = rows - inputLineCount;
  return outputRow < 1 ? undefined : { outputRow };
}

function assertNever(value: never): never {
  throw new Error(`Unexpected running input effect: ${JSON.stringify(value)}`);
}
