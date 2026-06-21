import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents, type Key } from "node:readline";

import { ansi, paint } from "./ansi.js";

export type EscInterruptState = {
  readonly armedAt?: number;
};

export type EscInterruptUpdate = {
  readonly state: EscInterruptState;
  readonly effect: "arm" | "abort";
};

export const escInterruptWindowMs = 1_500;

export async function runWithEscInterrupt<T>(
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  if (input.isTTY !== true || output.isTTY !== true) {
    return task(controller.signal);
  }

  let state: EscInterruptState = {};
  const previousRawMode = input.isRaw;
  const onKeypress = (_value: string | undefined, key: Key): void => {
    if (key.name !== "escape") {
      return;
    }
    const update = nextEscInterruptState(state, Date.now());
    state = update.state;
    if (update.effect === "arm") {
      output.write(interruptHint("esc again to interrupt", ansi.yellow));
      return;
    }
    output.write(interruptHint("interrupting agent run", ansi.red));
    controller.abort();
  };

  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  input.on("keypress", onKeypress);
  output.write(interruptHint("esc interrupt", ansi.guide));
  try {
    return await task(controller.signal);
  } finally {
    input.off("keypress", onKeypress);
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
