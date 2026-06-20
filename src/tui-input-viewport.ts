import { terminalVisibleWidth } from "./terminal-width.js";

export type InputViewport = {
  readonly text: string;
  readonly cursorColumn: number;
};

type IndexedChar = {
  readonly char: string;
  readonly start: number;
  readonly end: number;
  readonly width: number;
};

const overflowMarker = "…";

export function inputViewport(text: string, cursor: number, maxWidth: number): InputViewport {
  if (maxWidth <= 0) {
    return { text: "", cursorColumn: 0 };
  }

  if (terminalVisibleWidth(text) <= maxWidth) {
    return { text, cursorColumn: terminalVisibleWidth(text.slice(0, cursor)) };
  }

  const chars = indexedChars(text);
  const cursorIndex = cursorCharIndex(chars, cursor);
  const start = viewportStart(chars, cursorIndex, maxWidth);
  const end = viewportEnd(chars, start, maxWidth);
  const leftMarker = start > 0 ? overflowMarker : "";
  const rightMarker = end < chars.length ? overflowMarker : "";
  const visible = `${leftMarker}${chars.slice(start, end).map((item) => item.char).join("")}${rightMarker}`;
  const cursorColumn = terminalVisibleWidth(leftMarker) + charsWidth(chars, start, cursorIndex);
  return { text: visible, cursorColumn: Math.min(cursorColumn, terminalVisibleWidth(visible)) };
}

function indexedChars(text: string): readonly IndexedChar[] {
  const chars: IndexedChar[] = [];
  let offset = 0;
  for (const char of text) {
    const end = offset + char.length;
    chars.push({ char, start: offset, end, width: terminalVisibleWidth(char) });
    offset = end;
  }
  return chars;
}

function cursorCharIndex(chars: readonly IndexedChar[], cursor: number): number {
  const index = chars.findIndex((char) => cursor < char.end);
  return index === -1 ? chars.length : index;
}

function viewportStart(chars: readonly IndexedChar[], cursorIndex: number, maxWidth: number): number {
  let start = 0;
  while (start < cursorIndex && charsWidth(chars, start, cursorIndex) > availableBeforeCursor(start, cursorIndex, chars.length, maxWidth)) {
    start += 1;
  }
  return start;
}

function viewportEnd(chars: readonly IndexedChar[], start: number, maxWidth: number): number {
  const leftWidth = start > 0 ? terminalVisibleWidth(overflowMarker) : 0;
  let end = start;
  let width = 0;
  while (end < chars.length) {
    const nextWidth = chars[end]?.width ?? 0;
    const rightWidth = end + 1 < chars.length ? terminalVisibleWidth(overflowMarker) : 0;
    if (leftWidth + width + nextWidth + rightWidth > maxWidth) {
      break;
    }
    width += nextWidth;
    end += 1;
  }
  return Math.max(end, start);
}

function availableBeforeCursor(start: number, cursorIndex: number, charCount: number, maxWidth: number): number {
  const leftWidth = start > 0 ? terminalVisibleWidth(overflowMarker) : 0;
  const rightWidth = cursorIndex < charCount ? terminalVisibleWidth(overflowMarker) : 0;
  return Math.max(0, maxWidth - leftWidth - rightWidth);
}

function charsWidth(chars: readonly IndexedChar[], start: number, end: number): number {
  return chars.slice(start, end).reduce((total, char) => total + char.width, 0);
}
