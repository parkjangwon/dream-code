import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents, type Key } from "node:readline";

import type { AgentSteering } from "./agent-steering.js";
import { clearRenderedInputView } from "./tui-input-render.js";
import type { RenderedInputView } from "./tui-input-frame.js";
import { actionForKey } from "./tui-input.js";
import { createInputState, reduceInputState } from "./tui-input-state.js";
import { renderRunningInputView, runningInputCursorSequence } from "./tui-running-input-render.js";
import { nextEscInterruptState, type EscInterruptState } from "./tui-interrupt.js";
import type { ResizeSubscriber } from "./tui-fullscreen.js";
import { readStdoutTerminalSize, sameTerminalSize, startTerminalSizeWatcher, type TerminalSize } from "./terminal-size-watch.js";
import {
  createTerminalOutputScrollInput,
  createTerminalMouseInputSuppressor,
  scrollOutputForVerticalKey,
} from "./tui-output-scroll.js";
import {
  applySteeringInput,
  createSteeringInputState,
  type SteeringInputState,
} from "./steering-input-state.js";

export type RunningInputSession = AgentSteering & {
  readonly signal: AbortSignal;
  readonly start: () => void;
  readonly stop: () => readonly string[];
  readonly cursorSequence: () => string;
  readonly prepareForOutput: () => void;
  readonly refreshAfterOutput: () => void;
};

export function createRunningInputSession(
  statusLines: readonly string[],
  onResize?: ResizeSubscriber,
): RunningInputSession {
  const controller = new AbortController();
  let inputState = createInputState([], []);
  let steeringState = createSteeringInputState();
  let renderedFrame: RenderedInputView | undefined;
  let feedback = "";
  let escState: EscInterruptState = {};
  let steeringAbort = new AbortController();
  let streamActive = false;
  let streamInterrupted = false;
  let previousRawMode = false;
  let started = false;
  let unsubscribeResize: (() => void) | undefined;
  let stopSizeWatcher: (() => void) | undefined;
  let lastRenderedSize: TerminalSize = readStdoutTerminalSize();
  const mouseInputSuppressor = createTerminalMouseInputSuppressor();
  const outputScrollInput = createTerminalOutputScrollInput();

  const render = (): void => {
    lastRenderedSize = readStdoutTerminalSize();
    renderedFrame = renderRunningInputView(inputState, steeringState.queue.length, feedback, statusLines, renderedFrame);
  };
  const repairAfterResize = (): void => {
    renderedFrame = undefined;
    render();
  };
  const onKeypress = (value: string | undefined, key: Key): void => {
    if (mouseInputSuppressor.shouldSuppressKeypress(value, key)) {
      return;
    }
    if (inputState.palette === undefined && scrollOutputForVerticalKey(key)) {
      return;
    }
    if (key.name === "escape") {
      const update = nextEscInterruptState(escState, Date.now());
      escState = update.state;
      if (update.effect === "abort") {
        controller.abort();
      }
      feedback = update.effect === "abort" ? "interrupting agent run" : "esc again to interrupt";
      render();
      return;
    }
    if (key.ctrl === true && key.name === "c") {
      controller.abort();
      feedback = "interrupting agent run";
      render();
      return;
    }
    const action = actionForKey(value, key);
    if (action === undefined) {
      return;
    }
    const update = reduceInputState(inputState, action);
    inputState = update.state;
    if (update.effect.kind === "submit") {
      applySubmittedText(update.effect.text);
      return;
    }
    feedback = "";
    render();
  };
  const onData = (chunk: Buffer | string): void => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    mouseInputSuppressor.observe(text);
    outputScrollInput.handle(text);
  };

  return {
    signal: controller.signal,
    start: () => {
      if (started || input.isTTY !== true) {
        return;
      }
      started = true;
      previousRawMode = input.isRaw;
      input.on("data", onData);
      emitKeypressEvents(input);
      input.setRawMode(true);
      input.resume();
      input.on("keypress", onKeypress);
      unsubscribeResize = onResize?.(repairAfterResize) ?? subscribeStdoutResize(repairAfterResize);
      stopSizeWatcher = startTerminalSizeWatcher({ onChange: repairAfterResize });
      render();
    },
    stop: () => {
      if (started) {
        input.off("keypress", onKeypress);
        input.off("data", onData);
        unsubscribeResize?.();
        unsubscribeResize = undefined;
        stopSizeWatcher?.();
        stopSizeWatcher = undefined;
        input.setRawMode(previousRawMode);
        input.pause();
      }
      const queuedInputs = steeringState.queue.map((item) => item.text);
      clearRenderedInputView(renderedFrame);
      renderedFrame = undefined;
      return queuedInputs;
    },
    cursorSequence: () => runningInputCursorSequence(renderedFrame),
    prepareForOutput: () => {
      clearRenderedInputView(renderedFrame);
      renderedFrame = undefined;
    },
    refreshAfterOutput: () => {
      if (renderedFrame === undefined || !sameTerminalSize(lastRenderedSize, readStdoutTerminalSize())) {
        repairAfterResize();
      }
    },
    streamSignal: () => {
      streamActive = true;
      return steeringAbort.signal;
    },
    finishStream: () => {
      streamActive = false;
    },
    consumeInterrupt: () => {
      const interrupted = streamInterrupted;
      streamInterrupted = false;
      return interrupted;
    },
    drain: () => {
      const pending = steeringState.steering;
      if (pending.length === 0) {
        return [];
      }
      steeringState = { ...steeringState, steering: [] };
      feedback = `applied ${pending.length} steering ${pending.length === 1 ? "item" : "items"}`;
      render();
      return pending;
    },
  };

  function applySubmittedText(text: string): void {
    const update = applySteeringInput(steeringState, text);
    steeringState = update.state;
    inputState = createInputState([], []);
    feedback = update.effect.message;
    if (update.effect.kind === "steered" && streamActive) {
      streamInterrupted = true;
      steeringAbort.abort();
      steeringAbort = new AbortController();
    }
    render();
  }
}

function subscribeStdoutResize(callback: () => void): () => void {
  output.on("resize", callback);
  return () => {
    output.off("resize", callback);
  };
}
