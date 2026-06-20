import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents } from "node:readline";
import type { Key } from "node:readline";

import { ansi, paint } from "./ansi.js";
import { clearRenderedLines, displayInputText, renderInputView } from "./tui-input-render.js";
import { createInputState, reduceInputState, type InputAction } from "./tui-input-state.js";
import type { SlashCommand } from "./tui-commands.js";

export type InteractiveInputOptions = {
  readonly prompt: string;
  readonly history: readonly string[];
  readonly commands: readonly SlashCommand[];
  readonly redrawHeader: () => void;
  readonly secret?: boolean;
};

export type InteractiveInputResult =
  | { readonly kind: "submit"; readonly text: string }
  | { readonly kind: "cancel" };

export function readInteractiveInput(
  options: InteractiveInputOptions,
): Promise<InteractiveInputResult> {
  return new Promise((resolve) => {
    let state = createInputState(options.history, options.commands);
    let renderedLines = 0;
    const previousRawMode = input.isRaw;

    const render = (): void => {
      clearRenderedLines(renderedLines);
      renderedLines = renderInputView(state, options.prompt, options.secret === true);
    };

    const finish = (result: InteractiveInputResult): void => {
      clearRenderedLines(renderedLines);
      cleanup();
      if (result.kind === "submit") {
        output.write(`${paint(options.prompt, ansi.accent)}${displayInputText(result.text, options.secret === true)}\n`);
      } else {
        output.write("^C\n");
      }
      resolve(result);
    };

    const onKeypress = (value: string | undefined, key: Key): void => {
      const action = actionForKey(value, key);
      if (action === undefined) {
        return;
      }

      const update = reduceInputState(state, action);
      state = update.state;

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
          finish({ kind: "cancel" });
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

function actionForKey(value: string | undefined, key: Key): InputAction | undefined {
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
