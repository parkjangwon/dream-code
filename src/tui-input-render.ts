import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import type { InputState } from "./tui-input-state.js";
import { shortcutGuideLines } from "./tui-shortcuts.js";

const maxVisibleCommands = 8;

export function renderInputView(
  state: InputState,
  prompt: string,
  secret = false,
): number {
  const width = Math.max(64, output.columns ?? 80);
  const contentWidth = width - 4;
  const promptLine = `${paint(prompt, ansi.accent)}${displayInputText(state.text, secret)}`;
  const cursorText = displayInputText(state.text.slice(0, state.cursor), secret);
  const lines = [
    borderLine("top", width),
    boxedLine(promptLine, contentWidth),
    borderLine("bottom", width),
    ...renderAuxiliaryLines(state, secret, width),
  ];
  output.write(lines.join("\n"));
  moveCursorToPrompt(lines.length, 2 + terminalVisibleWidth(prompt) + terminalVisibleWidth(cursorText));
  return lines.length;
}

export function clearRenderedLines(count: number): void {
  if (count === 0) {
    return;
  }

  output.write("\r");
  output.write("\u001B[1A\r");
  for (let index = 0; index < count; index += 1) {
    output.write("\u001B[2K");
    if (index < count - 1) {
      output.write("\u001B[1B\r");
    }
  }

  if (count > 1) {
    output.write(`\u001B[${count - 1}A\r`);
  }
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
    case "skill":
      return renderSkillPaletteLines(state.palette, width);
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
  const lines = [paint("Commands", ansi.guide)];

  for (let index = 0; index < visible.length; index += 1) {
    const command = visible[index];
    if (command !== undefined) {
      const selected = start + index === palette.selectedIndex ? ">" : " ";
      const prefix = `${selected} ${command.name.padEnd(12)} `;
      lines.push(`${prefix}${paint(renderPaletteDescription(command.summary, width - terminalVisibleWidth(prefix)), ansi.dim)}`);
    }
  }

  return lines;
}

function renderSkillPaletteLines(
  palette: NonNullable<InputState["palette"]> & { readonly kind: "skill" },
  width: number,
): readonly string[] {
  const start = Math.max(
    0,
    Math.min(palette.selectedIndex, palette.matches.length - maxVisibleCommands),
  );
  const visible = palette.matches.slice(start, start + maxVisibleCommands);
  const lines = [paint("Skills", ansi.guide)];

  for (let index = 0; index < visible.length; index += 1) {
    const skill = visible[index];
    if (skill !== undefined) {
      const selected = start + index === palette.selectedIndex ? ">" : " ";
      const prefix = `${selected} @${skill.name.padEnd(12)} `;
      lines.push(`${prefix}${paint(renderPaletteDescription(skill.description, width - terminalVisibleWidth(prefix)), ansi.dim)}`);
    }
  }

  return lines;
}

function moveCursorToPrompt(lineCount: number, columns: number): void {
  const linesToPrompt = cursorUpToPromptLineCount(lineCount);
  if (linesToPrompt > 0) {
    output.write(`\u001B[${linesToPrompt}A`);
  }
  output.write("\r");
  if (columns > 0) {
    output.write(`\u001B[${columns}C`);
  }
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

export function cursorUpToPromptLineCount(lineCount: number): number {
  return Math.max(0, lineCount - 2);
}

export function shouldShowInlineShortcutGuide(text: string): boolean {
  return text === "?";
}

export function displayInputText(text: string, secret: boolean): string {
  return secret ? "*".repeat(text.length) : text;
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
