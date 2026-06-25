import { stdin as input } from "node:process";
import { emitKeypressEvents, type Key } from "node:readline";

import type { AgentSteering } from "./agent-steering.js";
import { clearRenderedInputView } from "./tui-input-render.js";
import type { RenderedInputView } from "./tui-input-frame.js";
import { actionForKey } from "./tui-input.js";
import { createInputState, reduceInputState } from "./tui-input-state.js";
import { renderRunningInputView, runningInputCursorSequence } from "./tui-running-input-render.js";
import { nextEscInterruptState, type EscInterruptState } from "./tui-interrupt.js";
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
};

export function createRunningInputSession(statusLines: readonly string[]): RunningInputSession {
  const controller = new AbortController();
  let inputState = createInputState([], []);
  let steeringState = createSteeringInputState();
  let renderedFrame: RenderedInputView | undefined;
  let feedback = "";
  let escState: EscInterruptState = {};
  let previousRawMode = false;
  let started = false;

  const render = (): void => {
    renderedFrame = renderRunningInputView(inputState, steeringState.queue.length, feedback, statusLines, renderedFrame);
  };
  const onKeypress = (value: string | undefined, key: Key): void => {
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

  return {
    signal: controller.signal,
    start: () => {
      if (started || input.isTTY !== true) {
        return;
      }
      started = true;
      previousRawMode = input.isRaw;
      emitKeypressEvents(input);
      input.setRawMode(true);
      input.resume();
      input.on("keypress", onKeypress);
      render();
    },
    stop: () => {
      if (started) {
        input.off("keypress", onKeypress);
        input.setRawMode(previousRawMode);
        input.pause();
      }
      const queuedInputs = steeringState.queue.map((item) => item.text);
      clearRenderedInputView(renderedFrame);
      renderedFrame = undefined;
      return queuedInputs;
    },
    cursorSequence: () => runningInputCursorSequence(renderedFrame),
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
    render();
  }
}
