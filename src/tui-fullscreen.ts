import { stdout as output } from "node:process";

import { clearScreen } from "./ansi.js";

export type ResizeSubscriber = (callback: () => void) => () => void;

export type FullscreenSession = {
  readonly onResize: ResizeSubscriber;
  readonly dispose: () => void;
};

export type FullscreenSessionOptions = {
  readonly repaint: () => void;
  readonly resizeDebounceMs?: number;
};

const enterAlternateScreen = "\u001B[?1049h";
const exitAlternateScreen = "\u001B[?1049l";
const showCursor = "\u001B[?25h";
const hideCursor = "\u001B[?25l";
const disableBracketedPaste = "\u001B[?2004l";
const disableMouseTracking = [
  "\u001B[?1000l",
  "\u001B[?1002l",
  "\u001B[?1003l",
  "\u001B[?1006l",
  "\u001B[?1015l",
].join("");
const cleanupSignals = ["SIGHUP", "SIGTERM"] as const;

type CleanupSignal = typeof cleanupSignals[number];

export function fullscreenEnterSequence(): string {
  return `${enterAlternateScreen}${clearScreen()}${hideCursor}`;
}

export function fullscreenExitSequence(): string {
  return `${disableMouseTracking}${disableBracketedPaste}${showCursor}${clearScreen()}${exitAlternateScreen}`;
}

export function startFullscreenSession(options: FullscreenSessionOptions): FullscreenSession {
  const resizeSubscribers: Array<() => void> = [];
  const debounceMs = options.resizeDebounceMs ?? 25;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const flushResize = (): void => {
    resizeTimer = undefined;
    if (disposed) {
      return;
    }
    options.repaint();
    for (const callback of [...resizeSubscribers]) {
      callback();
    }
  };
  const scheduleResize = (): void => {
    if (resizeTimer !== undefined) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(flushResize, debounceMs);
  };
  const cleanupOnly = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    if (resizeTimer !== undefined) {
      clearTimeout(resizeTimer);
      resizeTimer = undefined;
    }
    output.off("resize", scheduleResize);
    output.write(fullscreenExitSequence());
  };
  const onSignal = (signal: CleanupSignal): void => {
    removeProcessHandlers();
    cleanupOnly();
    process.kill(process.pid, signal);
  };
  const onUncaughtException = (error: Error): void => {
    removeProcessHandlers();
    cleanupOnly();
    throw error;
  };
  const removeProcessHandlers = (): void => {
    process.off("exit", cleanupOnly);
    process.off("uncaughtException", onUncaughtException);
    for (const signal of cleanupSignals) {
      process.off(signal, onSignal);
    }
  };

  output.write(fullscreenEnterSequence());
  options.repaint();
  output.on("resize", scheduleResize);
  process.once("exit", cleanupOnly);
  process.once("uncaughtException", onUncaughtException);
  for (const signal of cleanupSignals) {
    process.once(signal, onSignal);
  }

  return {
    onResize: (callback) => {
      resizeSubscribers.push(callback);
      return () => {
        const index = resizeSubscribers.indexOf(callback);
        if (index >= 0) {
          resizeSubscribers.splice(index, 1);
        }
      };
    },
    dispose: () => {
      removeProcessHandlers();
      cleanupOnly();
    },
  };
}
