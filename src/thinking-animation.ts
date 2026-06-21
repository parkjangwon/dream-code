import { ansi, paint } from "./ansi.js";
import { brailleSpinner } from "./braille-ui.js";

export type TimerHandle = unknown;
export type IntervalScheduler = (callback: () => void, intervalMs: number) => TimerHandle;
export type IntervalClearer = (handle: TimerHandle) => void;

export type ThinkingAnimation = {
  readonly start: () => void;
  readonly stop: () => void;
};

export type ThinkingAnimationOptions = {
  readonly label: string;
  readonly write: (text: string) => void;
  readonly setInterval?: IntervalScheduler;
  readonly clearInterval?: IntervalClearer;
  readonly intervalMs?: number;
};

export function createThinkingAnimation(options: ThinkingAnimationOptions): ThinkingAnimation {
  let frame = 0;
  let active = false;
  let timer: TimerHandle | undefined;
  const schedule = options.setInterval ?? setTimer;
  const clear = options.clearInterval ?? clearTimer;

  return {
    start: () => {
      if (timer !== undefined) {
        return;
      }
      active = true;
      writeFrame(false, frame, options);
      timer = schedule(() => {
        if (!active) {
          return;
        }
        frame += 1;
        writeFrame(true, frame, options);
      }, options.intervalMs ?? 180);
    },
    stop: () => {
      active = false;
      if (timer === undefined) {
        return;
      }
      clear(timer);
      timer = undefined;
    },
  };
}

function writeFrame(replace: boolean, frame: number, options: ThinkingAnimationOptions): void {
  const prefix = replace ? clearPreviousLine() : "";
  options.write(`${prefix}${paint(brailleSpinner(frame), ansi.accent)} ${paint(thinkingLabel(frame), ansi.dim)} ${paint(options.label, ansi.guide)}\n`);
}

function setTimer(callback: () => void, intervalMs: number): TimerHandle {
  return globalThis.setInterval(callback, intervalMs);
}

function clearTimer(handle: TimerHandle): void {
  globalThis.clearInterval(handle as ReturnType<typeof setInterval>);
}

function clearPreviousLine(): string {
  return "\u001B[1A\r\u001B[2K";
}

function thinkingLabel(frame: number): string {
  return `Thinking${".".repeat(frame % 4)}`;
}
