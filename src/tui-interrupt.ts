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

export type EscInterruptOptions = {
  readonly onRunningCommand?: (command: RunningCommand) => Promise<void> | void;
};

export async function runWithEscInterrupt<T>(
  task: (signal: AbortSignal) => Promise<T>,
  options: EscInterruptOptions = {},
): Promise<T> {
  const controller = new AbortController();
  if (input.isTTY !== true || output.isTTY !== true) {
    return task(controller.signal);
  }

  let state: EscInterruptState = {};
  let runningInput = initialRunningInputState();
  let pendingCommand = Promise.resolve();
  const previousRawMode = input.isRaw;
  const onKeypress = (value: string | undefined, key: Key): void => {
    if (key.ctrl === true && key.name === "c") {
      output.write(interruptHint("interrupting agent run", ansi.red));
      controller.abort();
      return;
    }
    if (key.name === "escape") {
      const update = nextEscInterruptState(state, Date.now());
      state = update.state;
      if (update.effect === "arm") {
        output.write(interruptHint("esc again to interrupt", ansi.yellow));
        renderRunningPrompt(runningInput);
        return;
      }
      output.write(interruptHint("interrupting agent run", ansi.red));
      controller.abort();
      return;
    }

    const update = reduceRunningInputState(runningInput, value, key);
    runningInput = update.state;
    if (update.effect.kind === "render") {
      renderRunningPrompt(runningInput);
      return;
    }
    if (update.effect.kind === "submit") {
      const command = update.effect.command;
      output.write("\r\u001B[2K");
      pendingCommand = pendingCommand
        .then(async () => dispatchRunningCommand(command, options, controller))
        .catch((error: unknown) => {
          output.write(interruptHint(error instanceof Error ? error.message : "running command failed", ansi.red));
        })
        .finally(() => {
          renderRunningPrompt(runningInput);
        });
    }
  };

  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  input.on("keypress", onKeypress);
  output.write(interruptHint("esc interrupt · type steering text · /status /agents /interrupt", ansi.guide));
  renderRunningPrompt(runningInput);
  try {
    return await task(controller.signal);
  } finally {
    input.off("keypress", onKeypress);
    await pendingCommand;
    output.write("\r\u001B[2K");
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
): Promise<void> {
  if (command.kind === "ignore") {
    return;
  }
  if (command.kind === "interrupt") {
    output.write(interruptHint("interrupting agent run", ansi.red));
    controller.abort();
    return;
  }
  await options.onRunningCommand?.(command);
  if (command.kind === "steer" && command.priority) {
    output.write(interruptHint("priority steering queued; interrupting current run", ansi.yellow));
    controller.abort();
  }
}

function renderRunningPrompt(state: RunningInputState): void {
  const prefix = `${paint(".......", ansi.accent)}  ${paint("running >", ansi.guide)} `;
  output.write(`\r\u001B[2K${prefix}${state.buffer}`);
  const suffixLength = state.buffer.length - state.cursor;
  if (suffixLength > 0) {
    output.write(`\u001B[${suffixLength}D`);
  }
}
