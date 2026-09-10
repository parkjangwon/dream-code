import { terminalVisibleWidth } from "./terminal-width.js";

const wrappedContinuationIndentWidth = 2;

export function clampScrollOffset(
  offset: number,
  mainRows: number,
  logicalLines: readonly string[],
  terminalColumns: number | undefined,
): number {
  const columns = Math.max(1, terminalColumns ?? 80);
  const visualLineCount = logicalLines.flatMap((line) => wrapVisibleLine(line, columns)).length;
  const maxOffset = Math.max(0, visualLineCount - mainRows);
  return Math.min(Math.max(0, offset), maxOffset);
}

export function wrapVisibleLine(line: string, width: number): readonly string[] {
  if (line.length === 0) {
    return [""];
  }
  const continuationIndentWidth = width > wrappedContinuationIndentWidth ? wrappedContinuationIndentWidth : 0;
  const continuationIndent = " ".repeat(continuationIndentWidth);
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;
  let rowWidthLimit = width;
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
    if (currentWidth > 0 && currentWidth + charWidth > rowWidthLimit) {
      lines.push(current);
      current = continuationIndent;
      currentWidth = continuationIndentWidth;
      rowWidthLimit = width - continuationIndentWidth;
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
