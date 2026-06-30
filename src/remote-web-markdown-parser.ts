export type MarkdownBlock =
  | { readonly kind: "blockquote"; readonly text: string }
  | { readonly kind: "code"; readonly language: string; readonly text: string }
  | { readonly kind: "divider" }
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly string[] }
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "table"; readonly headers: readonly string[]; readonly rows: readonly (readonly string[])[] };

export function parseMarkdown(markdown: string): readonly MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.trim().split(/\r?\n/u);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      index += 1;
    } else if (line.startsWith("```")) {
      const parsed = readCodeBlock(lines, index);
      blocks.push(parsed.block);
      index = parsed.nextIndex;
    } else if (isTableStart(lines, index)) {
      const parsed = readTable(lines, index);
      blocks.push(parsed.block);
      index = parsed.nextIndex;
    } else if (isDivider(line)) {
      blocks.push({ kind: "divider" });
      index += 1;
    } else if (line.startsWith("# ")) {
      blocks.push({ kind: "heading", level: 1, text: line.slice(2).trim() });
      index += 1;
    } else if (line.startsWith("## ")) {
      blocks.push({ kind: "heading", level: 2, text: line.slice(3).trim() });
      index += 1;
    } else if (line.startsWith("### ")) {
      blocks.push({ kind: "heading", level: 3, text: line.slice(4).trim() });
      index += 1;
    } else if (line.startsWith(">")) {
      const parsed = readBlockquote(lines, index);
      blocks.push(parsed.block);
      index = parsed.nextIndex;
    } else if (isListLine(line)) {
      const parsed = readList(lines, index);
      blocks.push(parsed.block);
      index = parsed.nextIndex;
    } else {
      const parsed = readParagraph(lines, index);
      blocks.push(parsed.block);
      index = parsed.nextIndex;
    }
  }
  return blocks;
}

function readCodeBlock(lines: readonly string[], start: number): { readonly block: MarkdownBlock; readonly nextIndex: number } {
  const opener = lines[start] ?? "```";
  const language = opener.slice(3).trim();
  const body: string[] = [];
  let index = start + 1;
  while (index < lines.length && lines[index] !== "```") {
    body.push(lines[index] ?? "");
    index += 1;
  }
  return { block: { kind: "code", language, text: body.join("\n") }, nextIndex: index + 1 };
}

function readTable(lines: readonly string[], start: number): { readonly block: MarkdownBlock; readonly nextIndex: number } {
  const headers = tableCells(lines[start] ?? "");
  const rows: string[][] = [];
  let index = start + 2;
  while (index < lines.length && isTableRow(lines[index] ?? "")) {
    rows.push(normalizeTableCells(tableCells(lines[index] ?? ""), headers.length));
    index += 1;
  }
  return { block: { kind: "table", headers, rows }, nextIndex: index };
}

function readList(lines: readonly string[], start: number): { readonly block: MarkdownBlock; readonly nextIndex: number } {
  const items: string[] = [];
  const ordered = isOrderedListLine(lines[start] ?? "");
  let index = start;
  while (index < lines.length && isListLine(lines[index] ?? "") && isOrderedListLine(lines[index] ?? "") === ordered) {
    items.push((lines[index] ?? "").replace(/^\s*(?:[-*]|\d+\.)\s+/u, "").trim());
    index += 1;
  }
  return { block: { kind: "list", ordered, items }, nextIndex: index };
}

function readBlockquote(lines: readonly string[], start: number): { readonly block: MarkdownBlock; readonly nextIndex: number } {
  const parts: string[] = [];
  let index = start;
  while (index < lines.length && (lines[index] ?? "").startsWith(">")) {
    parts.push((lines[index] ?? "").replace(/^>\s?/u, "").trim());
    index += 1;
  }
  return { block: { kind: "blockquote", text: parts.join(" ") }, nextIndex: index };
}

function readParagraph(lines: readonly string[], start: number): { readonly block: MarkdownBlock; readonly nextIndex: number } {
  const parts: string[] = [];
  let index = start;
  while (index < lines.length && lines[index]?.trim().length !== 0 && !startsBlock(lines, index)) {
    parts.push((lines[index] ?? "").trim());
    index += 1;
  }
  return { block: { kind: "paragraph", text: parts.join(" ") }, nextIndex: index };
}

function startsBlock(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? "";
  return line.startsWith("```")
    || line.startsWith("# ")
    || line.startsWith("## ")
    || line.startsWith("### ")
    || line.startsWith(">")
    || isDivider(line)
    || isTableStart(lines, index)
    || isListLine(line);
}

function isTableStart(lines: readonly string[], index: number): boolean {
  return isTableRow(lines[index] ?? "") && isTableDelimiterLine(lines[index + 1] ?? "");
}

function isTableRow(line: string): boolean {
  return /^\s*\|.+\|\s*$/u.test(line);
}

function isTableDelimiterLine(line: string): boolean {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function tableCells(line: string): readonly string[] {
  return line.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|").map((cell) => cell.trim());
}

function normalizeTableCells(cells: readonly string[], length: number): string[] {
  return Array.from({ length }, (_unused, index) => cells[index] ?? "");
}

function isListLine(line: string): boolean {
  return /^\s*(?:[-*]|\d+\.)\s+\S/u.test(line);
}

function isOrderedListLine(line: string): boolean {
  return /^\s*\d+\.\s+\S/u.test(line);
}

function isDivider(line: string): boolean {
  return /^\s*---+\s*$/u.test(line);
}
