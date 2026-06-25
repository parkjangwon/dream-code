import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import type { DreamSkill } from "./skills.js";
import type { FileMentionTarget } from "./file-mention-targets.js";
import { withHiddenCursor } from "./terminal-frame.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import { cockpitPromptRowOffsetFromBottom, renderCockpitFrame } from "./tui-cockpit.js";
import {
  clearRenderedInputViewSequence,
  cursorToFrameStartSequence,
  cursorToPromptSequence,
  renderedInputViewFromCockpit,
} from "./tui-input-frame.js";
import type { RenderedInputView } from "./tui-input-frame.js";
import { inputViewport } from "./tui-input-viewport.js";
import type { InputState } from "./tui-input-state.js";
import { shortcutGuideLines } from "./tui-shortcuts.js";

const maxVisibleCommands = 8;

export type { RenderedInputView } from "./tui-input-frame.js";

export function renderInputView(
  state: InputState,
  prompt: string,
  secret = false,
  statusLines: readonly string[] = [],
  previousFrame: RenderedInputView | undefined = undefined,
): RenderedInputView {
  const width = Math.max(64, output.columns ?? 80);
  const promptWidth = terminalVisibleWidth(prompt);
  const viewport = inputViewport(state.text, state.cursor, Math.max(0, width - promptWidth));
  const promptLine = `${paint(prompt, ansi.accent)}${renderInputText(viewport.text, secret, state.skills, state.fileMentions)}`;
  const frame = renderCockpitFrame({
    promptLine,
    promptCursorColumn: promptWidth + viewport.cursorColumn,
    width,
    auxiliaryLines: renderAuxiliaryLines(state, secret, width),
    footerLines: statusLines,
  });
  const renderedFrame = renderedInputViewFromCockpit(frame, output.rows);
  output.write(withHiddenCursor([
    clearRenderedInputViewSequence(previousFrame),
    cursorToFrameStartSequence(frame.lines.length, output.rows),
    frame.lines.join("\n"),
    cursorToPromptSequence(frame, output.rows),
  ].join("")));
  return renderedFrame;
}

export function renderInputViewLineCount(
  state: InputState,
  prompt: string,
  secret = false,
  statusLines: readonly string[] = [],
  previousFrame: RenderedInputView | undefined = undefined,
): number {
  return renderInputView(state, prompt, secret, statusLines, previousFrame).lineCount;
}

export function clearRenderedInputView(frame: RenderedInputView | undefined): void {
  if (frame === undefined) {
    return;
  }

  output.write(withHiddenCursor(clearRenderedInputViewSequence(frame)));
}

export function clearRenderedLines(count: number): void {
  if (count === 0) {
    return;
  }

  output.write(withHiddenCursor(clearRenderedLinesSequence(count)));
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

function padVisible(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - terminalVisibleWidth(text)))}`;
}

export function cursorUpToPromptLineCount(_lineCount: number, footerLineCount = 0): number {
  return cockpitPromptRowOffsetFromBottom(footerLineCount);
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
