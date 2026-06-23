import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import type { DreamSkill } from "./skills.js";
import type { FileMentionTarget } from "./file-mention-targets.js";
import { withHiddenCursor } from "./terminal-frame.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import { inputViewport } from "./tui-input-viewport.js";
import type { InputState } from "./tui-input-state.js";
import { shortcutGuideLines } from "./tui-shortcuts.js";

const maxVisibleCommands = 8;

export function renderInputView(
  state: InputState,
  prompt: string,
  secret = false,
  statusLines: readonly string[] = [],
  previousLineCount = 0,
): number {
  const width = Math.max(64, output.columns ?? 80);
  const lines = inputViewLines(state, prompt, secret, statusLines, width);
  const promptWidth = terminalVisibleWidth(prompt);
  const viewport = inputViewport(state.text, state.cursor, Math.max(0, width - 4 - promptWidth));
  output.write(withHiddenCursor([
    clearRenderedLinesSequence(previousLineCount),
    lines.join("\n"),
    cursorToPromptSequence(lines.length, 2 + promptWidth + viewport.cursorColumn),
  ].join("")));
  return lines.length;
}

export function renderAnchoredInputView(
  state: InputState,
  prompt: string,
  secret = false,
  statusLines: readonly string[] = [],
  previousLineCount = 0,
): number {
  const width = Math.max(64, output.columns ?? 80);
  const rows = output.rows ?? 24;
  const lines = inputViewLines(state, prompt, secret, statusLines, width);
  const startRow = Math.max(1, rows - lines.length + 1);
  const promptWidth = terminalVisibleWidth(prompt);
  const viewport = inputViewport(state.text, state.cursor, Math.max(0, width - 4 - promptWidth));
  output.write(withHiddenCursor([
    clearAnchoredInputArea(previousLineCount, rows),
    `\u001B[${startRow};1H`,
    lines.join("\n"),
    `\u001B[${startRow + 1};${3 + promptWidth + viewport.cursorColumn}H`,
  ].join("")));
  return lines.length;
}

export function inputViewLines(
  state: InputState,
  prompt: string,
  secret = false,
  statusLines: readonly string[] = [],
  width = Math.max(64, output.columns ?? 80),
): readonly string[] {
  const contentWidth = width - 4;
  const promptWidth = terminalVisibleWidth(prompt);
  const viewport = inputViewport(state.text, state.cursor, Math.max(0, contentWidth - promptWidth));
  const promptLine = `${paint(prompt, ansi.accent)}${renderInputText(viewport.text, secret, state.skills, state.fileMentions)}`;
  return [
    borderLine("top", width),
    boxedLine(promptLine, contentWidth),
    borderLine("bottom", width),
    ...statusLines,
    ...renderAuxiliaryLines(state, secret, width),
  ];
}

export function clearRenderedLines(count: number): void {
  if (count === 0) {
    return;
  }

  output.write(withHiddenCursor(clearRenderedLinesSequence(count)));
}

function clearAnchoredInputArea(previousLineCount: number, rows: number): string {
  if (previousLineCount === 0) {
    return "";
  }
  const startRow = Math.max(1, rows - previousLineCount + 1);
  let sequence = "";
  for (let row = startRow; row <= rows; row += 1) {
    sequence = `${sequence}\u001B[${row};1H\r\u001B[2K`;
  }
  return sequence;
}

function clearRenderedLinesSequence(count: number): string {
  if (count === 0) {
    return "";
  }

  let sequence = "\r\u001B[1A\r";
  for (let index = 0; index < count; index += 1) {
    sequence = `${sequence}\u001B[2K`;
    if (index < count - 1) {
      sequence = `${sequence}\u001B[1B\r`;
    }
  }

  if (count > 1) {
    sequence = `${sequence}\u001B[${count - 1}A\r`;
  }
  return sequence;
}

function renderAuxiliaryLines(
  state: InputState,
  secret: boolean,
  width: number,
): readonly string[] {
  if (secret) {
    return [];
  }

  const paletteLines = renderPaletteLines(state, width);
  if (paletteLines.length > 0) {
    return paletteLines;
  }

  if (shouldShowInlineShortcutGuide(state.text)) {
    return shortcutGuideLines();
  }

  return [paint("? for shortcuts", ansi.guide)];
}

function renderPaletteLines(state: InputState, width: number): readonly string[] {
  if (state.palette === undefined) {
    return [];
  }

  switch (state.palette.kind) {
    case "command":
      return renderCommandPaletteLines(state.palette, width);
    case "file":
      return renderFilePaletteLines(state.palette, width);
    default:
      return assertNever(state.palette);
  }
}

function renderCommandPaletteLines(
  palette: NonNullable<InputState["palette"]> & { readonly kind: "command" },
  width: number,
): readonly string[] {
  const start = Math.max(
    0,
    Math.min(palette.selectedIndex, palette.matches.length - maxVisibleCommands),
  );
  const visible = palette.matches.slice(start, start + maxVisibleCommands);
  const selectedCommand = palette.matches[palette.selectedIndex];
  const action = selectedCommand?.acceptsArgs === true ? "Enter completes" : "Enter runs";
  const lines = [formatPaletteHeading("Commands", palette.matches.length, start, visible.length, action)];

  for (let index = 0; index < visible.length; index += 1) {
    const command = visible[index];
    if (command !== undefined) {
      lines.push(formatCommandPaletteLine(command, start + index === palette.selectedIndex, width));
    }
  }

  return lines;
}

function renderFilePaletteLines(
  palette: NonNullable<InputState["palette"]> & { readonly kind: "file" },
  width: number,
): readonly string[] {
  const start = Math.max(
    0,
    Math.min(palette.selectedIndex, palette.matches.length - maxVisibleCommands),
  );
  const visible = palette.matches.slice(start, start + maxVisibleCommands);
  const lines = [formatPaletteHeading("Files", palette.matches.length, start, visible.length, "Enter inserts")];

  for (let index = 0; index < visible.length; index += 1) {
    const target = visible[index];
    if (target !== undefined) {
      lines.push(formatFilePaletteLine(target, start + index === palette.selectedIndex, width));
    }
  }

  return lines;
}

export function formatPaletteHeading(
  title: string,
  total: number,
  start: number,
  visibleCount: number,
  action: string,
): string {
  const rangeStart = total === 0 ? 0 : start + 1;
  const rangeEnd = start + visibleCount;
  return paint(`${title} ${rangeStart}-${rangeEnd}/${total} · ${action} · Esc closes`, ansi.guide);
}

export function formatCommandPaletteLine(
  command: { readonly name: string; readonly summary: string; readonly acceptsArgs: boolean },
  selected: boolean,
  width: number,
): string {
  const marker = selected ? paint(">", ansi.accent) : " ";
  const commandName = selected ? paint(command.name, ansi.accent) : command.name;
  const name = padVisible(commandName, 14);
  const prefix = `${marker} ${name} `;
  const summary = renderPaletteDescription(command.summary, width - terminalVisibleWidth(prefix));
  return `${prefix}${paint(summary, ansi.dim)}`;
}

export function formatFilePaletteLine(target: FileMentionTarget, selected: boolean, width: number): string {
  const marker = selected ? paint(">", ansi.accent) : " ";
  const mentionText = renderPaletteDescription(`@${target.path}`, 42);
  const mention = selected ? paint(mentionText, ansi.accent) : mentionText;
  const path = padVisible(mention, 44);
  const kind = padVisible(paint(target.kind, ansi.muted), 10);
  const prefix = `${marker} ${path} ${kind} `;
  const description = renderPaletteDescription(target.description, width - terminalVisibleWidth(prefix));
  return `${prefix}${paint(description, ansi.dim)}`;
}

function cursorToPromptSequence(lineCount: number, columns: number): string {
  const linesToPrompt = cursorUpToPromptLineCount(lineCount);
  let sequence = "";
  if (linesToPrompt > 0) {
    sequence = `${sequence}\u001B[${linesToPrompt}A`;
  }
  sequence = `${sequence}\r`;
  if (columns > 0) {
    sequence = `${sequence}\u001B[${columns}C`;
  }
  return sequence;
}

function borderLine(position: "top" | "bottom", width: number): string {
  const left = position === "top" ? "┌" : "└";
  const right = position === "top" ? "┐" : "┘";
  return paint(`${left}${"─".repeat(width - 2)}${right}`, ansi.guide);
}

function boxedLine(content: string, width: number): string {
  const padding = " ".repeat(Math.max(0, width - terminalVisibleWidth(content)));
  return `${paint("│", ansi.guide)} ${content}${padding} ${paint("│", ansi.guide)}`;
}

function padVisible(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - terminalVisibleWidth(text)))}`;
}

export function cursorUpToPromptLineCount(lineCount: number): number {
  return Math.max(0, lineCount - 2);
}

export function shouldShowInlineShortcutGuide(text: string): boolean {
  return text === "?";
}

export function displayInputText(text: string, secret: boolean): string {
  return secret ? "*".repeat(text.length) : text;
}

export function renderInputText(
  text: string,
  secret: boolean,
  skills: readonly DreamSkill[] = [],
  fileMentions: readonly FileMentionTarget[] = [],
): string {
  return secret ? displayInputText(text, true) : highlightFileMentions(text, fileMentions, skills);
}

function highlightFileMentions(
  text: string,
  fileMentions: readonly FileMentionTarget[],
  _skills: readonly DreamSkill[],
): string {
  const paths = new Set(fileMentions.map((target) => target.path.toLowerCase()));
  return text.replace(/(^|\s)(@[^\s]+)/gu, (_, prefix: string, mention: string) => {
    const path = mentionPath(mention);
    return path !== undefined && paths.has(path.toLowerCase())
      ? `${prefix}${paint(mention, ansi.blue)}`
      : `${prefix}${mention}`;
  });
}

function mentionPath(mention: string): string | undefined {
  const token = mention.slice(1).replace(/[),.;\]}]+$/u, "");
  const path = token.replace(/#\d+(?:-\d+)?$/u, "");
  return path.length === 0 ? undefined : path;
}

export function renderPaletteDescription(text: string, width: number): string {
  if (width <= 1) {
    return "";
  }
  if (terminalVisibleWidth(text) <= width) {
    return text;
  }

  let outputText = "";
  for (const char of text) {
    if (terminalVisibleWidth(`${outputText}${char}…`) > width) {
      return `${outputText}…`;
    }
    outputText = `${outputText}${char}`;
  }
  return outputText;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected input palette: ${String(value)}`);
}
