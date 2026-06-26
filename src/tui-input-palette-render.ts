import { ansi, paint } from "./ansi.js";
import type { FileMentionTarget } from "./file-mention-targets.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import type { InputState } from "./tui-input-state.js";

const maxVisibleCommands = 8;

export function renderPaletteLines(state: InputState, width: number): readonly string[] {
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

function padVisible(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - terminalVisibleWidth(text)))}`;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected input palette: ${String(value)}`);
}
