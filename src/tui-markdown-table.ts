import { ansi, paint } from "./ansi.js";
import { terminalVisibleWidth } from "./terminal-width.js";

export function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.slice(1, -1).includes("|");
}

export function isMarkdownTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);
}

export function renderMarkdownTable(
  lines: readonly string[],
  renderCell: (cell: string) => string,
): readonly string[] {
  const rows = lines.filter((line) => !isMarkdownTableDivider(line)).map(parseTableRow);
  const widths = columnWidths(rows);
  return rows.map((row, index) => renderTableRow(row, widths, renderCell, index === 0));
}

function parseTableRow(line: string): readonly string[] {
  return line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
}

function columnWidths(rows: readonly (readonly string[])[]): readonly number[] {
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  return Array.from({ length: columnCount }, (_unused, columnIndex) => {
    return Math.max(3, ...rows.map((row) => terminalVisibleWidth(row[columnIndex] ?? "")));
  });
}

function renderTableRow(
  row: readonly string[],
  widths: readonly number[],
  renderCell: (cell: string) => string,
  heading: boolean,
): string {
  const cells = widths.map((width, index) => {
    const cell = row[index] ?? "";
    const rendered = renderCell(cell);
    const padding = " ".repeat(Math.max(0, width - terminalVisibleWidth(cell)));
    return heading ? paint(`${rendered}${padding}`, ansi.bold) : `${rendered}${padding}`;
  });
  return `${paint("│ ", ansi.guide)}${cells.join(paint(" │ ", ansi.guide))}${paint(" │", ansi.guide)}`;
}
