import { h } from "preact";
import type { ComponentChildren } from "preact";

type MarkdownBlock =
  | { readonly kind: "blockquote"; readonly text: string }
  | { readonly kind: "code"; readonly language: string; readonly text: string }
  | { readonly kind: "divider" }
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly string[] }
  | { readonly kind: "paragraph"; readonly text: string };

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
    default:
      return assertNever(block);
  }
}

function parseMarkdown(markdown: string): readonly MarkdownBlock[] {
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
  while (index < lines.length && lines[index]?.trim().length !== 0 && !startsBlock(lines[index] ?? "")) {
    parts.push((lines[index] ?? "").trim());
    index += 1;
  }
  return { block: { kind: "paragraph", text: parts.join(" ") }, nextIndex: index };
}

function startsBlock(line: string): boolean {
  return line.startsWith("```")
    || line.startsWith("# ")
    || line.startsWith("## ")
    || line.startsWith("### ")
    || line.startsWith(">")
    || isDivider(line)
    || isListLine(line);
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
