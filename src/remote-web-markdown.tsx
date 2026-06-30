import { h } from "preact";
import type { ComponentChildren } from "preact";

import { parseMarkdown, type MarkdownBlock } from "./remote-web-markdown-parser.js";
export { parseMarkdown } from "./remote-web-markdown-parser.js";

type InlineNode =
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "link"; readonly href: string; readonly text: string }
  | { readonly kind: "strong"; readonly text: string }
  | { readonly kind: "text"; readonly text: string };

export function MarkdownView(props: { readonly markdown: string }) {
  const blocks = parseMarkdown(props.markdown);
  return (
    <div class="markdown-result">
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function renderBlock(block: MarkdownBlock, index: number) {
  switch (block.kind) {
    case "blockquote":
      return <blockquote key={index}>{renderInline(block.text, `quote-${index}`)}</blockquote>;
    case "code":
      return <pre class="md-code" key={index}><code>{block.text}</code></pre>;
    case "divider":
      return <hr class="md-divider" key={index} />;
    case "heading":
      if (block.level === 1) {
        return <h1 key={index}>{renderInline(block.text, `h1-${index}`)}</h1>;
      }
      return block.level === 2
        ? <h2 key={index}>{renderInline(block.text, `h2-${index}`)}</h2>
        : <h3 key={index}>{renderInline(block.text, `h3-${index}`)}</h3>;
    case "list":
      return block.ordered
        ? <ol key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `ol-${index}-${itemIndex}`)}</li>)}</ol>
        : <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `ul-${index}-${itemIndex}`)}</li>)}</ul>;
    case "paragraph":
      return <p key={index}>{renderInline(block.text, `p-${index}`)}</p>;
    case "table":
      return (
        <div class="md-table-wrap" key={index}>
          <table class="md-table">
            <thead>
              <tr>{block.headers.map((header, cellIndex) => <th key={cellIndex}>{renderInline(header, `th-${index}-${cellIndex}`)}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell, `td-${index}-${rowIndex}-${cellIndex}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return assertNever(block);
  }
}

function renderInline(text: string, keyPrefix: string): ComponentChildren {
  return parseInline(text).map((node, index) => {
    switch (node.kind) {
      case "code":
        return <code class="md-inline-code" key={`${keyPrefix}-code-${index}`}>{node.text}</code>;
      case "link":
        return <a class="md-link" key={`${keyPrefix}-link-${index}`} href={node.href} rel="noreferrer" target="_blank">{node.text}</a>;
      case "strong":
        return <strong key={`${keyPrefix}-strong-${index}`}>{node.text}</strong>;
      case "text":
        return node.text;
      default:
        return assertNever(node);
    }
  });
}

function parseInline(text: string): readonly InlineNode[] {
  const nodes: InlineNode[] = [];
  let index = 0;
  while (index < text.length) {
    const parsed = parseInlineAt(text, index);
    if (parsed !== undefined) {
      nodes.push(parsed.node);
      index = parsed.nextIndex;
      continue;
    }
    const next = nextInlineStart(text, index + 1);
    nodes.push({ kind: "text", text: text.slice(index, next) });
    index = next;
  }
  return mergeTextNodes(nodes);
}

function parseInlineAt(text: string, index: number): { readonly node: InlineNode; readonly nextIndex: number } | undefined {
  if (text[index] === "`") {
    const end = text.indexOf("`", index + 1);
    if (end > index + 1) {
      return { node: { kind: "code", text: text.slice(index + 1, end) }, nextIndex: end + 1 };
    }
  }
  if (text.startsWith("**", index)) {
    const end = text.indexOf("**", index + 2);
    if (end > index + 2) {
      return { node: { kind: "strong", text: text.slice(index + 2, end) }, nextIndex: end + 2 };
    }
  }
  if (text[index] === "[") {
    const match = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/u.exec(text.slice(index));
    if (match?.[1] !== undefined && match[2] !== undefined) {
      return { node: { kind: "link", text: match[1], href: match[2] }, nextIndex: index + match[0].length };
    }
  }
  return undefined;
}

function nextInlineStart(text: string, start: number): number {
  const candidates = ["`", "**", "["]
    .map((token) => text.indexOf(token, start))
    .filter((candidate) => candidate >= 0);
  return candidates.length === 0 ? text.length : Math.min(...candidates);
}

function mergeTextNodes(nodes: readonly InlineNode[]): readonly InlineNode[] {
  const merged: InlineNode[] = [];
  for (const node of nodes) {
    const previous = merged.at(-1);
    if (node.kind === "text" && previous?.kind === "text") {
      merged[merged.length - 1] = { kind: "text", text: `${previous.text}${node.text}` };
    } else {
      merged.push(node);
    }
  }
  return merged;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected markdown block: ${String(value)}`);
}
