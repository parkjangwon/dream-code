import { stdout as output } from "node:process";

import { ansi, clearScreen, paint } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { cockpitReservedRows, renderCockpitFrame } from "./tui-cockpit.js";
import { cursorToFrameStartSequence } from "./tui-input-frame.js";
import { renderHeaderPanel } from "./tui-render.js";
import { clearRowsFromCurrentPosition, cursorToRow } from "./terminal-frame.js";

export type LayeredTerminalLayout = {
  readonly topRows: number;
  readonly mainStartRow: number;
  readonly mainRows: number;
  readonly bottomRows: number;
};

export type LayeredScreenOptions = {
  readonly config: DreamConfig;
  readonly oneShotYolo: boolean;
  readonly statusLines: readonly string[];
  readonly busyLabel?: string;
  readonly guideLine?: string;
  readonly terminalRows?: number;
  readonly terminalColumns?: number;
};

export type LayeredMainWriter = {
  readonly write: (chunk: string) => boolean;
};

const topChromeRows = 5;
const minimumMainRows = 4;

export function layeredTerminalLayout(terminalRows: number | undefined): LayeredTerminalLayout {
  const rows = terminalRows ?? 24;
  const mainRows = Math.max(minimumMainRows, rows - topChromeRows - cockpitReservedRows);
  return {
    topRows: topChromeRows,
    mainStartRow: topChromeRows + 1,
    mainRows,
    bottomRows: cockpitReservedRows,
  };
}

export function renderLayeredScreen(options: LayeredScreenOptions): LayeredTerminalLayout {
  const columns = Math.max(64, options.terminalColumns ?? output.columns ?? 80);
  const rows = options.terminalRows ?? output.rows;
  const layout = layeredTerminalLayout(rows);
  output.write(clearScreen());
  renderTopChrome(options.config, options.oneShotYolo, columns);
  renderPassiveBottomDock(
    options.statusLines,
    options.busyLabel ?? "running",
    options.guideLine ?? "esc interrupt · input resumes after this turn",
    columns,
    rows,
    layout.mainStartRow,
  );
  output.write(`\u001B[${layout.mainStartRow};1H`);
  return layout;
}

export function createLayeredMainWriter(layout: LayeredTerminalLayout): LayeredMainWriter {
  let nextTextRow = layout.mainStartRow;
  let monitorRendered = false;
  return {
    write: (chunk) => {
      if (isAnchoredTerminalFrame(chunk)) {
        monitorRendered = true;
        return output.write(chunk);
      }
      if (isInlineTerminalFrame(chunk)) {
        return output.write(chunk);
      }
      let prefix = cursorToRow(nextTextRow);
      if (monitorRendered) {
        nextTextRow = layout.mainStartRow;
        prefix = `${cursorToRow(layout.mainStartRow)}${clearRowsFromCurrentPosition(layout.mainRows)}${cursorToRow(layout.mainStartRow)}`;
        monitorRendered = false;
      }
      output.write(`${prefix}${chunk}`);
      nextTextRow = Math.min(layout.mainStartRow + layout.mainRows - 1, nextTextRow + logicalLineCount(chunk));
      return true;
    },
  };
}

function renderTopChrome(config: DreamConfig, oneShotYolo: boolean, columns: number): void {
  const lines = renderHeaderPanel(config, oneShotYolo, columns);
  for (let index = 0; index < lines.length; index += 1) {
    output.write(`\u001B[${index + 1};1H${lines[index] ?? ""}`);
  }
}

function renderPassiveBottomDock(
  statusLines: readonly string[],
  busyLabel: string,
  guideLine: string,
  columns: number,
  rows: number | undefined,
  mainStartRow: number,
): void {
  const promptLine = `${paint("• ", ansi.accent)}${paint(busyLabel, ansi.dim)}`;
  const frame = renderCockpitFrame({
    promptLine,
    promptCursorColumn: 0,
    width: columns,
    auxiliaryLines: [paint(guideLine, ansi.guide)],
    footerLines: statusLines,
  });
  output.write([
    cursorToFrameStartSequence(frame.lines.length, rows),
    frame.lines.join("\n"),
    cursorToRow(mainStartRow),
  ].join(""));
}

function isAnchoredTerminalFrame(chunk: string): boolean {
  return chunk.startsWith("\u001B[?25l") && /\u001B\[\d+;1H/u.test(chunk);
}

function isInlineTerminalFrame(chunk: string): boolean {
  return chunk.startsWith("\u001B[?25l");
}

function logicalLineCount(text: string): number {
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text;
  return Math.max(1, trimmed.split("\n").length);
}
