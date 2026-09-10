import { stdin as input, stdout as output } from "node:process";

import { ansi, clearScreen, paint, stripAnsi } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { cockpitReservedRows, fitVisible, renderCockpitFrame } from "./tui-cockpit.js";
import { cursorToFrameStartSequence } from "./tui-input-frame.js";
import { renderHeaderPanel } from "./tui-render.js";
import { cursorToRow, withHiddenCursor } from "./terminal-frame.js";
import { isTermuxRuntime } from "./terminal-environment.js";
import { queryTerminalRows } from "./terminal-cursor-query.js";
import { flushLinesToScrollback } from "./tui-scrollback-flush.js";
import { clampScrollOffset, wrapVisibleLine } from "./tui-viewport-wrap.js";

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
  readonly input?: NodeJS.ReadStream;
};

export type LayeredMainWriter = {
  readonly write: (chunk: string) => boolean;
  readonly scroll: (lines: number) => boolean;
  readonly flushScrollback: () => void;
};

export type LayeredMainWriterOptions = {
  readonly afterWrite?: () => string;
  readonly afterRender?: () => void;
  readonly terminalRows?: () => number | undefined;
  readonly terminalColumns?: () => number | undefined;
  readonly topChrome?: {
    readonly config: DreamConfig;
    readonly oneShotYolo: boolean;
  };
};

const topChromeRows = 5;
const scrollbackViewportMultiplier = 200;

export function layeredTerminalLayout(terminalRows: number | undefined): LayeredTerminalLayout {
  const rows = terminalRows ?? 24;
  const mainRows = Math.max(1, rows - topChromeRows - cockpitReservedRows);
  return {
    topRows: topChromeRows,
    mainStartRow: topChromeRows + 1,
    mainRows,
    bottomRows: cockpitReservedRows,
  };
}

export async function renderLayeredScreen(options: LayeredScreenOptions): Promise<LayeredTerminalLayout> {
  const columns = Math.max(1, options.terminalColumns ?? output.columns ?? 80);
  output.write(clearScreen());
  const rows = await confirmedTerminalRows(options.terminalRows, options.input ?? input);
  const layout = layeredTerminalLayout(rows);
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

// process.stdout.rows is unreliable on Termux, which misplaced this screen's
// bottom dock (it addresses rows absolutely, from the total height down). No
// keypress listener is attached yet at this point in either caller, so this
// probe can run without needing the CPR-reply suppression the interactive
// input redraw path requires.
async function confirmedTerminalRows(
  terminalRowsOverride: number | undefined,
  inputStream: NodeJS.ReadStream,
): Promise<number | undefined> {
  const rows = terminalRowsOverride ?? output.rows;
  if (!isTermuxRuntime()) {
    return rows;
  }
  const confirmedRows = await queryTerminalRows(inputStream, output);
  return confirmedRows ?? rows;
}

export function createLayeredMainWriter(
  layout: LayeredTerminalLayout,
  options: LayeredMainWriterOptions = {},
): LayeredMainWriter {
  let logicalLines: string[] = [""];
  let monitorRendered = false;
  let scrollOffset = 0;
  return {
    write: (chunk) => {
      const currentLayout = activeLayout(layout, options);
      const currentColumns = activeColumns(options);
      if (isAnchoredTerminalFrame(chunk)) {
        monitorRendered = true;
        return writeLayeredFrame(withHiddenCursor(`${chunk}${options.afterWrite?.() ?? ""}`), options);
      }
      if (isInlineTerminalFrame(chunk)) {
        const animationLine = inlineAnimationLine(chunk);
        if (animationLine === undefined) {
          const afterWrite = options.afterWrite?.() ?? "";
          return afterWrite.length === 0 ? true : writeLayeredFrame(afterWrite, options);
        }
        logicalLines = replaceAnimatedLine(logicalLines, animationLine);
        scrollOffset = clampScrollOffset(scrollOffset, currentLayout.mainRows, logicalLines, currentColumns);
        writeLayeredFrame(withHiddenCursor(`${renderMainViewport(currentLayout, logicalLines, currentColumns, scrollOffset)}${options.afterWrite?.() ?? ""}`), options);
        return true;
      }
      if (monitorRendered) {
        logicalLines = [""];
        monitorRendered = false;
        scrollOffset = 0;
      }
      logicalLines = appendChunk(logicalLines, chunk).slice(-currentLayout.mainRows * scrollbackViewportMultiplier);
      scrollOffset = clampScrollOffset(scrollOffset, currentLayout.mainRows, logicalLines, currentColumns);
      return writeLayeredFrame(withHiddenCursor(`${renderMainViewport(currentLayout, logicalLines, currentColumns, scrollOffset)}${options.afterWrite?.() ?? ""}`), options);
    },
    scroll: (lines) => {
      const currentLayout = activeLayout(layout, options);
      const currentColumns = activeColumns(options);
      scrollOffset = clampScrollOffset(scrollOffset + lines, currentLayout.mainRows, logicalLines, currentColumns);
      return writeLayeredFrame(withHiddenCursor(`${renderMainViewport(currentLayout, logicalLines, currentColumns, scrollOffset)}${options.afterWrite?.() ?? ""}`), options);
    },
    flushScrollback: () => {
      const currentLayout = activeLayout(layout, options);
      const currentColumns = Math.max(1, activeColumns(options) ?? 80);
      const visualLines = logicalLines.flatMap((line) => wrapVisibleLine(line, currentColumns));
      if (visualLines.length <= currentLayout.mainRows) {
        return;
      }
      scrollOffset = 0;
      flushLinesToScrollback(
        visualLines.slice(0, visualLines.length - currentLayout.mainRows),
        currentLayout.topRows + currentLayout.mainRows + currentLayout.bottomRows,
        () => writeLayeredFrame(withHiddenCursor(renderMainViewport(currentLayout, logicalLines, currentColumns)), options),
      );
    },
  };
}

function writeLayeredFrame(text: string, options: LayeredMainWriterOptions): boolean {
  const chrome = options.topChrome === undefined
    ? ""
    : topChromeSequence(options.topChrome.config, options.topChrome.oneShotYolo, activeColumns(options));
  const written = output.write(`${chrome}${text}`);
  options.afterRender?.();
  return written;
}

function activeLayout(
  fallbackLayout: LayeredTerminalLayout,
  options: LayeredMainWriterOptions,
): LayeredTerminalLayout {
  const rows = options.terminalRows?.();
  return rows === undefined ? fallbackLayout : layeredTerminalLayout(rows);
}

function activeColumns(options: LayeredMainWriterOptions): number | undefined {
  return options.terminalColumns?.() ?? output.columns;
}

export function topChromeSequence(
  config: DreamConfig,
  oneShotYolo: boolean,
  terminalColumns: number | undefined,
): string {
  const columns = Math.max(1, terminalColumns ?? output.columns ?? 80);
  const lines = renderHeaderPanel(config, oneShotYolo, columns);
  const rows: string[] = [];
  for (let index = 0; index < topChromeRows; index += 1) {
    rows.push(`\u001B[${index + 1};1H\u001B[2K${lines[index] ?? ""}`);
  }
  return rows.join("");
}

function renderTopChrome(config: DreamConfig, oneShotYolo: boolean, columns: number): void {
  output.write(topChromeSequence(config, oneShotYolo, columns));
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

function appendChunk(lines: readonly string[], chunk: string): string[] {
  const nextLines = lines.length === 0 ? [""] : [...lines];
  const parts = chunk.replace(/\r/gu, "").split("\n");
  for (let index = 0; index < parts.length; index += 1) {
    const current = parts[index] ?? "";
    const lastIndex = nextLines.length - 1;
    nextLines[lastIndex] = `${nextLines[lastIndex] ?? ""}${current}`;
    if (index < parts.length - 1) {
      nextLines.push("");
    }
  }
  return nextLines;
}

function replaceAnimatedLine(lines: readonly string[], line: string): string[] {
  const nextLines = lines.length === 0 ? [""] : [...lines];
  const targetIndex = nextLines.at(-1) === "" && nextLines.length > 1 ? nextLines.length - 2 : nextLines.length - 1;
  nextLines[targetIndex] = line;
  return nextLines;
}

function inlineAnimationLine(chunk: string): string | undefined {
  const cleaned = chunk
    .replace(/\u001B\[\?25[lh]/gu, "")
    .replace(/\u001B\[1A\r/gu, "")
    .replace(/\u001B\[2K/gu, "")
    .replace(/\r/gu, "");
  const line = cleaned.split("\n").find((candidate) => stripAnsi(candidate).includes("Thinking"));
  return line === undefined || line.length === 0 ? undefined : line;
}

function renderMainViewport(
  layout: LayeredTerminalLayout,
  logicalLines: readonly string[],
  terminalColumns: number | undefined,
  scrollOffset = 0,
): string {
  const columns = Math.max(1, terminalColumns ?? 80);
  const visualLines = logicalLines.flatMap((line) => wrapVisibleLine(line, columns));
  const start = Math.max(0, visualLines.length - layout.mainRows - scrollOffset);
  const visibleLines = visualLines.slice(start, start + layout.mainRows);
  const rows: string[] = [];
  for (let index = 0; index < layout.mainRows; index += 1) {
    const line = visibleLines[index] ?? "";
    rows.push(`${cursorToRow(layout.mainStartRow + index)}\u001B[2K${fitVisible(line, columns)}`);
  }
  return rows.join("");
}
