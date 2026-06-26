import type { FileMentionTarget } from "./file-mention-targets.js";
import type { DreamSkill } from "./skills.js";
import type { SlashCommand } from "./tui-commands.js";
import type { PaletteState } from "./tui-input-palettes.js";

export type InputState = {
  readonly text: string;
  readonly cursor: number;
  readonly draft: string;
  readonly history: readonly string[];
  readonly historyIndex: number | undefined;
  readonly commands: readonly SlashCommand[];
  readonly skills: readonly DreamSkill[];
  readonly fileMentions: readonly FileMentionTarget[];
  readonly palette: PaletteState | undefined;
  readonly cancelOnEmptyBackspace: boolean;
};

export type InputAction =
  | { readonly kind: "insert"; readonly value: string }
  | { readonly kind: "backspace" }
  | { readonly kind: "delete" }
  | { readonly kind: "enter" }
  | { readonly kind: "up" }
  | { readonly kind: "down" }
  | { readonly kind: "left" }
  | { readonly kind: "right" }
  | { readonly kind: "home" }
  | { readonly kind: "end" }
  | { readonly kind: "clearBeforeCursor" }
  | { readonly kind: "clearAfterCursor" }
  | { readonly kind: "escape" }
  | { readonly kind: "ctrlL" }
  | { readonly kind: "ctrlC" };

export type InputEffect =
  | { readonly kind: "none" }
  | { readonly kind: "submit"; readonly text: string }
  | { readonly kind: "redraw" }
  | { readonly kind: "cancel"; readonly reason: "ctrlC" | "emptyBackspace" };

export type InputUpdate = {
  readonly state: InputState;
  readonly effect: InputEffect;
};
