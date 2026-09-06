import { stdin as input, stdout as output } from "node:process";

import { ansi, clearScreen, paint, stripAnsi } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { cockpitReservedRows, fitVisible, renderCockpitFrame } from "./tui-cockpit.js";
import { cursorToFrameStartSequence } from "./tui-input-frame.js";
import { renderHeaderPanel } from "./tui-render.js";
import { cursorToRow, withHiddenCursor } from "./terminal-frame.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import { isTermuxRuntime } from "./terminal-environment.js";
import { queryTerminalRows } from "./terminal-cursor-query.js";

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
};

export type LayeredMainWriterOptions = {
  readonly afterWrite?: () => string;
  readonly afterRender?: () => void;
  readonly terminalRows?: () => number | undefined;
  readonly terminalColumns?: () => number | undefined;
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
  const columns = Math.max(64, options.terminalColumns ?? output.columns ?? 80);
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
        scrollOffset = clampScrollOffset(scrollOffset, currentLayout, logicalLines, currentColumns);
        writeLayeredFrame(withHiddenCursor(`${renderMainViewport(currentLayout, logicalLines, currentColumns, scrollOffset)}${options.afterWrite?.() ?? ""}`), options);
        return true;
      }
      if (monitorRendered) {
        logicalLines = [""];
        monitorRendered = false;
        scrollOffset = 0;
      }
      logicalLines = appendChunk(logicalLines, chunk).slice(-currentLayout.mainRows * scrollbackViewportMultiplier);
      scrollOffset = clampScrollOffset(scrollOffset, currentLayout, logicalLines, currentColumns);
      return writeLayeredFrame(withHiddenCursor(`${renderMainViewport(currentLayout, logicalLines, currentColumns, scrollOffset)}${options.afterWrite?.() ?? ""}`), options);
    },
    scroll: (lines) => {
      const currentLayout = activeLayout(layout, options);
      const currentColumns = activeColumns(options);
      scrollOffset = clampScrollOffset(scrollOffset + lines, currentLayout, logicalLines, currentColumns);
      return writeLayeredFrame(withHiddenCursor(`${renderMainViewport(currentLayout, logicalLines, currentColumns, scrollOffset)}${options.afterWrite?.() ?? ""}`), options);
    },
  };
}

function writeLayeredFrame(text: string, options: LayeredMainWriterOptions): boolean {
  const written = output.write(text);
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

function clampScrollOffset(
  offset: number,
  layout: LayeredTerminalLayout,
  logicalLines: readonly string[],
  terminalColumns: number | undefined,
): number {
  const columns = Math.max(1, terminalColumns ?? 80);
  const visualLineCount = logicalLines.flatMap((line) => wrapVisibleLine(line, columns)).length;
  const maxOffset = Math.max(0, visualLineCount - layout.mainRows);
  return Math.min(Math.max(0, offset), maxOffset);
}

function wrapVisibleLine(line: string, width: number): readonly string[] {
  if (line.length === 0) {
    return [""];
  }
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;
  let index = 0;

  while (index < line.length) {
    const escape = ansiEscapeAt(line, index);
    if (escape !== undefined) {
      current = `${current}${escape}`;
      index += escape.length;
      continue;
    }
    const codePoint = line.codePointAt(index);
    if (codePoint === undefined) {
      break;
    }
    const char = String.fromCodePoint(codePoint);
    const charWidth = terminalVisibleWidth(char);
    if (currentWidth > 0 && currentWidth + charWidth > width) {
      lines.push(current);
      current = "";
      currentWidth = 0;
    }
    current = `${current}${char}`;
    currentWidth += charWidth;
    index += char.length;
  }

  lines.push(current);
  return lines;
}

function ansiEscapeAt(text: string, index: number): string | undefined {
  const match = /^\u001B\[[0-?]*[ -/]*[@-~]/u.exec(text.slice(index));
  return match?.[0];
}
