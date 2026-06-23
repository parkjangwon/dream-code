import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents, type Key } from "node:readline";

import { ansi, paint } from "./ansi.js";
import {
  initialRunningInputState,
  reduceRunningInputState,
  type RunningCommand,
  type RunningInputState,
} from "./tui-running-command.js";

export type EscInterruptState = {
  readonly armedAt?: number;
};

export type EscInterruptUpdate = {
  readonly state: EscInterruptState;
  readonly effect: "arm" | "abort";
};

export const escInterruptWindowMs = 1_500;

export type RunningOutputWriter = (text: string) => void;

export type EscInterruptOptions = {
  readonly onRunningCommand?: (command: RunningCommand, write: RunningOutputWriter) => Promise<void> | void;
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
  let runningInput = initialRunningInputState();
  let pendingCommand = Promise.resolve();
  const previousRawMode = input.isRaw;
  const writeInternal = (text: string): void => {
    output.write(text);
  };
  const writeGuardedOutput = (text: string): void => {
    writeInternal(formatGuardedRunningOutput(text, runningInput, output.rows));
  };
  const renderPrompt = (): void => {
    writeInternal(formatRunningPrompt(runningInput, output.rows));
  };
  const activateRegion = (): void => {
    writeInternal(formatActivateRunningInputRegion(output.rows));
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

    const update = reduceRunningInputState(runningInput, value, key);
    runningInput = update.state;
    if (update.effect.kind === "render") {
      renderPrompt();
      return;
    }
    if (update.effect.kind === "submit") {
      const command = update.effect.command;
      renderPrompt();
      pendingCommand = pendingCommand
        .then(async () => dispatchRunningCommand(command, options, controller, writeGuardedOutput))
        .catch((error: unknown) => {
          writeGuardedOutput(interruptHint(error instanceof Error ? error.message : "running command failed", ansi.red));
        })
        .finally(() => {
          renderPrompt();
        });
    }
  };
  const onResize = (): void => {
    activateRegion();
    renderPrompt();
  };

  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  input.on("keypress", onKeypress);
  output.on("resize", onResize);
  activateRegion();
  writeGuardedOutput(interruptHint("esc interrupt · type steering text · /status /agents /interrupt", ansi.guide));
  renderPrompt();
  try {
    return await task(controller.signal, writeGuardedOutput);
  } finally {
    input.off("keypress", onKeypress);
    output.off("resize", onResize);
    await pendingCommand;
    writeInternal(formatClearRunningPrompt(output.rows));
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
): Promise<void> {
  if (command.kind === "ignore") {
    return;
  }
  if (command.kind === "interrupt") {
    write(interruptHint("interrupting agent run", ansi.red));
    controller.abort();
    return;
  }
  await options.onRunningCommand?.(command, write);
  if (command.kind === "steer" && command.priority) {
    write(interruptHint("priority steering queued; interrupting current run", ansi.yellow));
    controller.abort();
  }
}

export function formatGuardedRunningOutput(text: string, state: RunningInputState, rows?: number): string {
  const boundary = text.endsWith("\n") || text.endsWith("\r") ? "" : "\n";
  return `${formatOutputCursor(rows)}${text}${boundary}${formatRunningPrompt(state, rows)}`;
}

function formatRunningPrompt(state: RunningInputState, rows?: number): string {
  const prefix = `${paint(".......", ansi.accent)}  ${paint("running >", ansi.guide)} `;
  const prompt = `${formatClearRunningPrompt(rows)}${prefix}${state.buffer}`;
  const suffixLength = state.buffer.length - state.cursor;
  return suffixLength > 0 ? `${prompt}\u001B[${suffixLength}D` : prompt;
}

function formatActivateRunningInputRegion(rows?: number): string {
  const region = runningInputRegion(rows);
  return region === undefined ? "" : `\u001B[1;${region.outputRow}r\u001B[${region.outputRow};1H`;
}

function formatDeactivateRunningInputRegion(): string {
  return "\u001B[r";
}

function formatOutputCursor(rows?: number): string {
  const region = runningInputRegion(rows);
  return region === undefined ? "\r\u001B[2K" : `\u001B[${region.outputRow};1H`;
}

function formatClearRunningPrompt(rows?: number): string {
  const region = runningInputRegion(rows);
  return region === undefined ? "\r\u001B[2K" : `\u001B[${region.inputRow};1H\r\u001B[2K`;
}

function runningInputRegion(rows?: number): { readonly outputRow: number; readonly inputRow: number } | undefined {
  return rows === undefined || rows < 4 ? undefined : { outputRow: rows - 1, inputRow: rows };
}
