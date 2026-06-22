import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";

const shortcutRows = [
  ["/ command or skill menu", "enter/tab submit"],
  ["@ file mention", "esc close menu"],
  ["up/down history or menu", "ctrl+l redraw screen"],
  ["! shell command", "ctrl+u/ctrl+k clear line"],
  ["ctrl+a/ctrl+e move cursor", "ctrl+c twice to exit"],
  ["? show shortcuts", ""],
] as const satisfies readonly (readonly [string, string])[];

export function shortcutGuideText(): string {
  return shortcutGuideLines().join("\n");
}

export function shortcutGuideLines(): readonly string[] {
  return shortcutRows.map(([left, right]) => {
    return `${paint(left.padEnd(30), ansi.guide)} ${paint(right, ansi.guide)}`;
  });
}

export function printShortcutGuide(): void {
  output.write(shortcutGuideText());
}
