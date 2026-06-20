import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";

const shortcutRows = [
  ["/ for commands", "! for shell commands"],
  ["shift+enter for newline", "tab to submit message"],
  ["@ for file paths", "ctrl+l to redraw screen"],
  ["ctrl+a/ctrl+e move cursor", "ctrl+c twice to exit"],
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
