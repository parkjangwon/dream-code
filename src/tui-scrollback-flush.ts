import { stdout as output } from "node:process";

import { clearScreen } from "./ansi.js";

// Pushes wrapped transcript rows into the terminal's physical scrollback so
// native touch scrolling can reach history once mouse tracking stops. The
// screen is intentionally left blank; the caller repaints header, viewport,
// and dock right after. Stale prior scrollback (old headers, shell noise) is
// cleared first so dragging up never resurrects duplicate chrome.
export function flushLinesToScrollback(
  lines: readonly string[],
  terminalRows: number,
  repaint: () => void,
): void {
  if (lines.length === 0) {
    return;
  }
  output.write(`${clearScreen()}\u001B[3J`);
  output.write(`${lines.join("\r\n")}\r\n${"\r\n".repeat(Math.max(1, terminalRows))}`);
  repaint();
}
