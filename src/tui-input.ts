import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents } from "node:readline";
import type { Key } from "node:readline";

import { ansi, paint } from "./ansi.js";
import { renderFixedPromptInputView } from "./tui-anchored-input-render.js";
import {
  agentViewLines,
  type AgentViewOptions,
  type AgentViewResult,
} from "./tui-agent-view.js";
import {
  createAgentViewState,
  hasActiveAgentRows,
  shouldFocusAgentViewFromInput,
  shouldReturnFromAgentView,
  updateAgentView,
} from "./tui-agent-view-state.js";
import { clearRenderedLines, renderInputText, renderInputView } from "./tui-input-render.js";
import { createInputState, reduceInputState, type InputAction } from "./tui-input-state.js";
import type { SlashCommand } from "./tui-commands.js";
import type { DreamSkill } from "./skills.js";
import type { FileMentionTarget } from "./file-mention-targets.js";

export type InteractiveInputOptions = {
  readonly prompt: string;
  readonly history: readonly string[];
  readonly commands: readonly SlashCommand[];
  readonly skills?: readonly DreamSkill[];
  readonly fileMentions?: readonly FileMentionTarget[];
  readonly redrawHeader: () => void;
  readonly secret?: boolean;
  readonly statusLines?: readonly string[];
  readonly cancelOnEmptyBackspace?: boolean;
  readonly agentView?: AgentViewOptions;
  readonly anchored?: boolean;
};

export type InteractiveInputResult =
  | { readonly kind: "submit"; readonly text: string }
  | { readonly kind: "cancel" }
  | { readonly kind: "agentView"; readonly result: AgentViewResult };

export const ctrlCExitWindowMs = 1_500;

export function shouldExitOnRepeatedCtrlC(
  lastCtrlCAt: number | undefined,
  now: number,
): boolean {
  return lastCtrlCAt !== undefined && now - lastCtrlCAt <= ctrlCExitWindowMs;
}

export function readInteractiveInput(
  options: InteractiveInputOptions,
): Promise<InteractiveInputResult> {
  return new Promise((resolve) => {
    let state = createInputState(options.history, options.commands, options.skills ?? [], {
      cancelOnEmptyBackspace: options.cancelOnEmptyBackspace === true,
      fileMentions: options.fileMentions ?? [],
    });
    const initialAgentView = options.agentView;
    let agentViewState = initialAgentView !== undefined && hasActiveAgentRows(initialAgentView)
      ? createAgentViewState(initialAgentView)
      : undefined;
    let agentViewFocused = false;
    let renderedLines = 0;
    let lastCtrlCAt: number | undefined;
    const previousRawMode = input.isRaw;

    const render = (): void => {
      renderedLines = renderInputFrame(renderedLines);
    };

    const finish = (result: InteractiveInputResult, echoCancel = true): void => {
      clearRenderedLines(renderedLines);
      cleanup();
      if (result.kind === "submit") {
        output.write(`${paint(options.prompt, ansi.accent)}${renderInputText(result.text, options.secret === true, options.skills ?? [], options.fileMentions ?? [])}\n`);
      } else if (echoCancel) {
        output.write("^C\n");
      }
      resolve(result);
    };

    const renderedStatusLines = (): readonly string[] => {
      if (options.anchored === true || !agentViewFocused || agentViewState === undefined) {
        return options.statusLines ?? [];
      }
      return [...(options.statusLines ?? []), "", ...agentViewLines(agentViewState, Math.max(80, output.columns ?? 80), inlineAgentViewMaxLines())];
    };

    const renderedAboveLines = (): readonly string[] => {
      if (options.anchored !== true || !agentViewFocused || agentViewState === undefined) {
        return [];
      }
      return ["", ...agentViewLines(agentViewState, Math.max(80, output.columns ?? 80), inlineAgentViewMaxLines())];
    };

    const renderInputFrame = (previousLineCount = 0): number => {
      if (options.anchored === true) {
        return renderFixedPromptInputView(state, options.prompt, options.secret === true, renderedStatusLines(), renderedAboveLines(), previousLineCount);
      }
      return renderInputView(state, options.prompt, options.secret === true, renderedStatusLines(), previousLineCount);
    };

    const onKeypress = (value: string | undefined, key: Key): void => {
      if (agentViewFocused && agentViewState !== undefined) {
        if (key.ctrl === true && key.name === "l") {
          options.redrawHeader();
          renderedLines = 0;
          render();
          return;
        }
        if (shouldReturnFromAgentView(agentViewState, key)) {
          agentViewFocused = false;
          agentViewState = undefined;
          render();
          return;
        }
        const agentUpdate = updateAgentView(agentViewState, value, key);
        agentViewState = agentUpdate.state;
        if (agentUpdate.result === undefined) {
          render();
          return;
        }
        if (agentUpdate.result.kind === "close") {
          agentViewFocused = false;
          agentViewState = undefined;
          render();
          return;
        }
        finish({ kind: "agentView", result: agentUpdate.result }, false);
        return;
      }

      const action = actionForKey(value, key);
      if (action === undefined) {
        return;
      }
      const agentView = options.agentView;
      if (action.kind === "down" && shouldFocusAgentViewFromInput(state, agentView) && agentView !== undefined) {
        agentViewState = createAgentViewState(agentView);
        agentViewFocused = true;
        render();
        return;
      }

      const update = reduceInputState(state, action);
      state = update.state;
      if (action.kind !== "ctrlC") {
        lastCtrlCAt = undefined;
      }

      switch (update.effect.kind) {
        case "none":
          render();
          return;
        case "submit":
          finish({ kind: "submit", text: update.effect.text });
          return;
        case "redraw":
          options.redrawHeader();
          renderedLines = 0;
          render();
          return;
        case "cancel":
          {
            if (update.effect.reason === "emptyBackspace") {
              finish({ kind: "cancel" }, false);
              return;
            }
            const now = Date.now();
            if (shouldExitOnRepeatedCtrlC(lastCtrlCAt, now)) {
              finish({ kind: "cancel" });
              return;
            }
            lastCtrlCAt = now;
            clearRenderedLines(renderedLines);
            output.write(`${paint("Press Ctrl+C again to exit", ansi.yellow)}\n`);
            renderedLines = renderInputFrame();
          }
          return;
        default:
          assertNever(update.effect);
      }
    };

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      input.setRawMode(previousRawMode);
      input.pause();
    };

    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on("keypress", onKeypress);
    render();
  });
}

function inlineAgentViewMaxLines(): number {
  return Math.max(6, Math.min(10, Math.floor((output.rows ?? 24) / 2)));
}

export function actionForKey(value: string | undefined, key: Key): InputAction | undefined {
  if (key.ctrl === true && key.name === "l") {
    return { kind: "ctrlL" };
  }
  if (key.ctrl === true && key.name === "c") {
    return { kind: "ctrlC" };
  }
  if (key.ctrl === true && key.name === "a") {
    return { kind: "home" };
  }
  if (key.ctrl === true && key.name === "e") {
    return { kind: "end" };
  }
  if (key.ctrl === true && key.name === "u") {
    return { kind: "clearBeforeCursor" };
  }
  if (key.ctrl === true && key.name === "k") {
    return { kind: "clearAfterCursor" };
  }

  switch (key.name) {
    case "return":
    case "enter":
    case "tab":
      return { kind: "enter" };
    case "backspace":
      return { kind: "backspace" };
    case "delete":
      return { kind: "delete" };
    case "up":
      return { kind: "up" };
    case "down":
      return { kind: "down" };
    case "left":
      return { kind: "left" };
    case "right":
      return { kind: "right" };
    case "home":
      return { kind: "home" };
    case "end":
      return { kind: "end" };
    case "escape":
      return { kind: "escape" };
    default:
      break;
  }

  if (key.ctrl === true || key.meta === true || value === undefined || value.length === 0) {
    return undefined;
  }

  return { kind: "insert", value };
}

function assertNever(value: never): never {
  throw new Error(`Unexpected input effect: ${String(value)}`);
}
