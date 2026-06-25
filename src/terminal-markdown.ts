import type { MarkdownState } from "./tui-agent-response.js";
import { renderInlineMarkdown, renderMarkdownLine } from "./tui-agent-response.js";
import {
  isMarkdownTableDivider,
  isMarkdownTableRow,
  renderMarkdownTable,
} from "./tui-markdown-table.js";

export function renderTerminalMarkdown(markdown: string): string {
  let state: MarkdownState = { kind: "text" };
  let tableBuffer: readonly string[] = [];
  const renderedLines: string[] = [];

  const flushTable = (): void => {
    if (tableBuffer.length === 0) {
      return;
    }
    renderedLines.push(...renderMarkdownTable(tableBuffer, renderInlineMarkdown));
    tableBuffer = [];
  };

  for (const line of markdown.split(/\r?\n/u)) {
    if (state.kind === "text" && (isMarkdownTableRow(line) || isMarkdownTableDivider(line))) {
      tableBuffer = [...tableBuffer, line];
      continue;
    }

    flushTable();
    const rendered = renderMarkdownLine(line, state);
    renderedLines.push(rendered.text);
    state = rendered.state;
  }

  flushTable();
  return renderedLines.join("\n");
}
