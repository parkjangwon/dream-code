const esc = "";

export const cursorPositionReportRequestSequence = `${esc}[6n`;

export type CursorPositionReport = {
  readonly row: number;
  readonly column: number;
  readonly endIndex: number;
};

const cursorPositionReportPattern = /^\[(\d+);(\d+)R/u;

export function cursorPositionReportAt(text: string, startIndex: number): CursorPositionReport | undefined {
  const match = cursorPositionReportPattern.exec(text.slice(startIndex));
  if (match === null) {
    return undefined;
  }
  const row = Number(match[1]);
  const column = Number(match[2]);
  return { row, column, endIndex: startIndex + match[0].length };
}

export function findCursorPositionReport(text: string): CursorPositionReport | undefined {
  let index = 0;
  while (index < text.length) {
    const prefixIndex = text.indexOf(esc, index);
    if (prefixIndex === -1) {
      return undefined;
    }
    const report = cursorPositionReportAt(text, prefixIndex);
    if (report !== undefined) {
      return report;
    }
    index = prefixIndex + 1;
  }
  return undefined;
}

export function stripCursorPositionReports(text: string): string {
  let result = "";
  let index = 0;
  while (index < text.length) {
    const report = cursorPositionReportAt(text, index);
    if (report !== undefined) {
      index = report.endIndex;
      continue;
    }
    result = `${result}${text[index] ?? ""}`;
    index += 1;
  }
  return result;
}

const cursorPositionReportTailPattern = /^\[\d*(?:;\d*R?)?$/u;

// Node's readline can deliver an in-flight CPR reply to the keypress listener split
// across two calls (a lone ESC, then the CSI tail). Both shapes must be recognized
// independently since suppression has no memory across keypress calls.
export function isCursorPositionReportFragment(fragment: string): boolean {
  if (fragment === esc) {
    return true;
  }
  const tail = fragment.startsWith(esc) ? fragment.slice(esc.length) : fragment;
  return tail.length > 0 && cursorPositionReportTailPattern.test(tail);
}
