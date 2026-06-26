import type { SlashCommand } from "./tui-commands.js";
import type { DreamSkill } from "./skills.js";
import type { FileMentionTarget } from "./file-mention-targets.js";
import type { InputAction, InputState, InputUpdate } from "./tui-input-state-types.js";
import {
  movePalette as moveCompletionPalette,
  paletteFor,
  selectedPaletteCommand,
  selectedPaletteMentionReplacement,
} from "./tui-input-palettes.js";

export type { InputAction, InputEffect, InputState, InputUpdate } from "./tui-input-state-types.js";

export function createInputState(
  history: readonly string[],
  commands: readonly SlashCommand[],
  skills: readonly DreamSkill[] = [],
  options: { readonly cancelOnEmptyBackspace?: boolean; readonly fileMentions?: readonly FileMentionTarget[] } = {},
): InputState {
  return {
    text: "",
    cursor: 0,
    draft: "",
    history,
    historyIndex: undefined,
    commands,
    skills,
    fileMentions: options.fileMentions ?? [],
    palette: undefined,
    cancelOnEmptyBackspace: options.cancelOnEmptyBackspace === true,
  };
}

export function reduceInputState(state: InputState, action: InputAction): InputUpdate {
  switch (action.kind) {
    case "insert":
      return insertText(state, action.value);
    case "backspace":
      return deleteBeforeCursor(state);
    case "delete":
      return deleteAtCursor(state);
    case "enter":
      return acceptInput(state);
    case "up":
      return state.palette === undefined ? moveHistory(state, "up") : movePalette(state, "up");
    case "down":
      return state.palette === undefined ? moveHistory(state, "down") : movePalette(state, "down");
    case "left":
      return moveCursor(state, Math.max(0, state.cursor - 1));
    case "right":
      return moveCursor(state, Math.min(state.text.length, state.cursor + 1));
    case "home":
      return moveCursor(state, 0);
    case "end":
      return moveCursor(state, state.text.length);
    case "clearBeforeCursor":
      return clearBeforeCursor(state);
    case "clearAfterCursor":
      return clearAfterCursor(state);
    case "escape":
      return { state: { ...state, palette: undefined }, effect: { kind: "none" } };
    case "ctrlL":
      return { state, effect: { kind: "redraw" } };
    case "ctrlC":
      return { state, effect: { kind: "cancel", reason: "ctrlC" } };
    default:
      return assertNever(action);
  }
}

function insertText(state: InputState, value: string): InputUpdate {
  const text = `${state.text.slice(0, state.cursor)}${value}${state.text.slice(state.cursor)}`;
  return withTextAndCursor(state, text, state.cursor + value.length);
}

function deleteBeforeCursor(state: InputState): InputUpdate {
  if (state.cursor === 0) {
    if (state.text.length === 0 && state.cancelOnEmptyBackspace) {
      return { state, effect: { kind: "cancel", reason: "emptyBackspace" } };
    }
    return { state, effect: { kind: "none" } };
  }

  const text = `${state.text.slice(0, state.cursor - 1)}${state.text.slice(state.cursor)}`;
  return withTextAndCursor(state, text, state.cursor - 1);
}

function deleteAtCursor(state: InputState): InputUpdate {
  if (state.cursor >= state.text.length) {
    return { state, effect: { kind: "none" } };
  }

  const text = `${state.text.slice(0, state.cursor)}${state.text.slice(state.cursor + 1)}`;
  return withTextAndCursor(state, text, state.cursor);
}

function moveCursor(state: InputState, cursor: number): InputUpdate {
  return { state: { ...state, cursor }, effect: { kind: "none" } };
}

function clearBeforeCursor(state: InputState): InputUpdate {
  const text = state.text.slice(state.cursor);
  return withTextAndCursor(state, text, 0);
}

function clearAfterCursor(state: InputState): InputUpdate {
  const text = state.text.slice(0, state.cursor);
  return withTextAndCursor(state, text, state.cursor);
}

function withTextAndCursor(state: InputState, text: string, cursor: number): InputUpdate {
  return {
    state: {
      ...state,
      text,
      cursor,
      draft: text,
      historyIndex: undefined,
      palette: paletteFor(text, state.commands, state.skills, state.fileMentions, cursor),
    },
    effect: { kind: "none" },
  };
}

function acceptInput(state: InputState): InputUpdate {
  const selectedCommand = selectedPaletteCommand(state.palette);
  if (selectedCommand !== undefined) {
    if (selectedCommand.acceptsArgs) {
      return {
        state: {
          ...state,
          text: `${selectedCommand.name} `,
          cursor: selectedCommand.name.length + 1,
          draft: `${selectedCommand.name} `,
          palette: undefined,
        },
        effect: { kind: "none" },
      };
    }
    return { state, effect: { kind: "submit", text: selectedCommand.name } };
  }

  const palette = state.palette;
  const replacement = selectedPaletteMentionReplacement(palette);
  if (replacement !== undefined && palette?.kind === "file") {
    const text = `${state.text.slice(0, palette.tokenStart)}${replacement}${state.text.slice(state.cursor)}`;
    return {
      state: {
        ...state,
        text,
        cursor: palette.tokenStart + replacement.length,
        draft: text,
        historyIndex: undefined,
        palette: undefined,
      },
      effect: { kind: "none" },
    };
  }

  return { state, effect: { kind: "submit", text: state.text } };
}

function movePalette(state: InputState, direction: "up" | "down"): InputUpdate {
  if (state.palette === undefined) {
    return { state, effect: { kind: "none" } };
  }

  return {
    state: { ...state, palette: moveCompletionPalette(state.palette, direction) },
    effect: { kind: "none" },
  };
}

function moveHistory(state: InputState, direction: "up" | "down"): InputUpdate {
  if (state.history.length === 0) {
    return { state, effect: { kind: "none" } };
  }

  if (direction === "up") {
    const nextIndex = state.historyIndex === undefined
      ? state.history.length - 1
      : Math.max(0, state.historyIndex - 1);
    return stateWithHistoryIndex(state, nextIndex);
  }

  if (state.historyIndex === undefined) {
    return { state, effect: { kind: "none" } };
  }

  if (state.historyIndex < state.history.length - 1) {
    return stateWithHistoryIndex(state, state.historyIndex + 1);
  }

  return {
    state: {
      ...state,
      text: state.draft,
      cursor: state.draft.length,
      historyIndex: undefined,
      palette: paletteFor(state.draft, state.commands, state.skills, state.fileMentions),
    },
    effect: { kind: "none" },
  };
}

function stateWithHistoryIndex(state: InputState, historyIndex: number): InputUpdate {
  const text = state.history[historyIndex] ?? "";
  return {
    state: {
      ...state,
      text,
      cursor: text.length,
      historyIndex,
      palette: undefined,
    },
    effect: { kind: "none" },
  };
}

function assertNever(value: never): never {
  throw new Error(`Unexpected input action: ${String(value)}`);
}
