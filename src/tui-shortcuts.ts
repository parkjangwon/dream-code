import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";

const shortcutRows = [
  ["/ command menu", "enter/tab submit"],
  ["up/down history or menu", "esc close menu"],
  ["! shell command", "ctrl+l redraw screen"],
  ["ctrl+a/ctrl+e move cursor", "ctrl+u/ctrl+k clear line"],
  ["ctrl+c twice to exit", "? show shortcuts"],
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
