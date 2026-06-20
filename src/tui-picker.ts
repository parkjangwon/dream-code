import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents } from "node:readline";
import type { Key } from "node:readline";

import { ansi, paint } from "./ansi.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import { clearRenderedLines, renderPaletteDescription } from "./tui-input-render.js";
import {
  createPickerState,
  pickerSelection,
  pickerVisibleChoices,
  reducePickerState,
  type PickerAction,
  type PickerChoice,
  type PickerState,
} from "./tui-picker-state.js";

export type { PickerChoice };

export type PickerOptions = {
  readonly title: string;
  readonly choices: readonly PickerChoice[];
  readonly initialValue?: string;
};

export type InteractivePickerOptions = PickerOptions & {
  readonly redrawHeader: () => void;
};

const maxVisibleChoices = 12;

export function readInteractivePicker(
  options: InteractivePickerOptions,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let state = createPickerState(options.choices, options.initialValue);
    let renderedLines = 0;
    const previousRawMode = input.isRaw;

    const render = (): void => {
      clearRenderedLines(renderedLines);
      renderedLines = renderPickerView(options.title, state);
    };

    const finish = (value: string | undefined): void => {
      clearRenderedLines(renderedLines);
      cleanup();
      resolve(value);
    };

    const onKeypress = (value: string | undefined, key: Key): void => {
      if (key.ctrl === true && key.name === "l") {
        options.redrawHeader();
        renderedLines = 0;
        render();
        return;
      }
      if (key.name === "return" || key.name === "enter" || key.name === "tab") {
        finish(pickerSelection(state)?.value);
        return;
      }
      if (isPickerBackKey(key.name)) {
        finish(undefined);
        return;
      }

      const action = pickerActionForKey(value, key);
      if (action === undefined) {
        return;
      }
      state = reducePickerState(state, action);
      render();
    };

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      input.setRawMode(previousRawMode);
      input.pause();
    };

    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on("keypress", onKeypress);
    render();
  });
}

function renderPickerView(title: string, state: PickerState): number {
  const width = Math.max(64, output.columns ?? 80);
  const visible = pickerVisibleChoices(state);
  const selected = pickerSelection(state);
  const start = visibleStart(state.selectedIndex, visible.length);
  const windowed = visible.slice(start, start + maxVisibleChoices);
  const lines = [
    `${paint(title, ansi.accent)} ${paint("type to filter", ansi.dim)}`,
    `${paint("Search:", ansi.guide)} ${state.query}`,
  ];

  for (let index = 0; index < windowed.length; index += 1) {
    const choice = windowed[index];
    if (choice !== undefined) {
      lines.push(formatChoiceLine(choice, selected?.value === choice.value, width));
    }
  }
  if (visible.length === 0) {
    lines.push(paint("No matches", ansi.yellow));
  }
  lines.push(paint("↑/↓ navigate · enter select · esc close", ansi.guide));
  output.write(lines.join("\n"));
  moveCursorToSearchLine(lines.length, state.query);
  return lines.length;
}

function pickerActionForKey(
  value: string | undefined,
  key: Key,
): PickerAction | undefined {
  switch (key.name) {
    case "up":
      return { kind: "up" };
    case "down":
      return { kind: "down" };
    case "backspace":
    case "delete":
      return { kind: "backspace" };
    default:
      break;
  }
  if (key.ctrl === true || key.meta === true || value === undefined || value.length === 0) {
    return undefined;
  }
  return { kind: "insert", value };
}

export function isPickerBackKey(keyName: string | undefined): boolean {
  return keyName === "escape";
}

function visibleStart(selectedIndex: number, visibleCount: number): number {
  return Math.max(0, Math.min(selectedIndex, visibleCount - maxVisibleChoices));
}

export function formatChoiceLine(choice: PickerChoice, selected: boolean, width = 80): string {
  const marker = selected ? paint(">", ansi.accent) : " ";
  const labelWidth = Math.min(34, Math.max(16, Math.floor(width * 0.3)));
  const label = padVisible(renderPaletteDescription(choice.label, labelWidth), labelWidth);
  const prefix = `${marker} ${label}`;
  const description = choice.description.length > 0
    ? ` ${formatDescription(choice, width - terminalVisibleWidth(prefix) - 1)}`
    : "";
  return `${prefix}${description}`;
}

function formatDescription(choice: PickerChoice, width: number): string {
  const description = renderPaletteDescription(choice.description, width);
  return choice.descriptionStyle === "raw"
    ? description
    : paint(description, ansi.dim);
}

function padVisible(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - terminalVisibleWidth(text)))}`;
}

function moveCursorToSearchLine(lineCount: number, query: string): void {
  const linesToSearch = Math.max(0, lineCount - 2);
  if (linesToSearch > 0) {
    output.write(`\u001B[${linesToSearch}A`);
  }
  output.write("\r");
  output.write(`\u001B[${8 + terminalVisibleWidth(query)}C`);
}
