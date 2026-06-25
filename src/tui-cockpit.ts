import { paint, ansi } from "./ansi.js";
import { terminalVisibleWidth } from "./terminal-width.js";

export const cockpitReservedRows = 6;

export type CockpitFrameInput = {
  readonly promptLine: string;
  readonly promptCursorColumn: number;
  readonly width: number;
  readonly auxiliaryLines: readonly string[];
  readonly footerLines: readonly string[];
  readonly liveStatusLine?: string;
};

export type CockpitFrame = {
  readonly lines: readonly string[];
  readonly promptCursorColumn: number;
  readonly promptLineIndex: number;
  readonly promptRowOffsetFromBottom: number;
};

export function renderCockpitFrame(input: CockpitFrameInput): CockpitFrame {
  const width = Math.max(1, input.width);
  const footerLines = input.footerLines.map((line) => padVisible(line, width));
  const lines = [
    ...input.auxiliaryLines.map((line) => padVisible(line, width)),
    padVisible(input.liveStatusLine ?? "", width),
    separatorLine(width),
    padVisible(input.promptLine, width),
    separatorLine(width),
    ...footerLines,
  ];

  return {
    lines,
    promptCursorColumn: Math.min(input.promptCursorColumn, width),
    promptLineIndex: input.auxiliaryLines.length + 2,
    promptRowOffsetFromBottom: cockpitPromptRowOffsetFromBottom(footerLines.length),
  };
}

export function cockpitPromptRowOffsetFromBottom(footerLineCount: number): number {
  return Math.max(0, footerLineCount) + 1;
}

function separatorLine(width: number): string {
  return paint("─".repeat(width), ansi.guide);
}

function padVisible(text: string, width: number): string {
  const fitted = fitVisible(text, width);
  return `${fitted}${" ".repeat(Math.max(0, width - terminalVisibleWidth(fitted)))}`;
}

export function fitVisible(text: string, width: number): string {
  if (width <= 0) {
    return "";
  }
  if (terminalVisibleWidth(text) <= width) {
    return text;
  }

  const marker = "…";
  const limit = Math.max(0, width - terminalVisibleWidth(marker));
  let visibleWidth = 0;
  let output = "";
  let index = 0;

  while (index < text.length) {
    const escape = ansiEscapeAt(text, index);
    if (escape !== undefined) {
      output = `${output}${escape}`;
      index += escape.length;
      continue;
    }

    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) {
      break;
    }
    const char = String.fromCodePoint(codePoint);
    const charWidth = terminalVisibleWidth(char);
    if (visibleWidth + charWidth > limit) {
      return `${output}${marker}${ansi.reset}`;
    }
    output = `${output}${char}`;
    visibleWidth += charWidth;
    index += char.length;
  }

  return output;
}

function ansiEscapeAt(text: string, index: number): string | undefined {
  const match = /^\u001B\[[0-?]*[ -/]*[@-~]/u.exec(text.slice(index));
  return match?.[0];
}
