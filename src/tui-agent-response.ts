import { ansi, paint } from "./ansi.js";
import type { SelectedModel } from "./model-routing.js";

export type AgentResponseSession = {
  readonly start: () => void;
  readonly token: (token: string) => void;
  readonly finish: () => void;
  readonly fail: (message: string, tone: "warn" | "error") => void;
};

export type AgentResponseSessionOptions = {
  readonly selectedModel: SelectedModel;
  readonly write: (text: string) => void;
  readonly now?: () => number;
};

export function createAgentResponseSession(options: AgentResponseSessionOptions): AgentResponseSession {
  const now = options.now ?? Date.now;
  const startedAt = now();
  let receivedToken = false;
  let atLineStart = true;
  let characterCount = 0;

  const model = modelLabel(options.selectedModel);

  return {
    start: () => {
      options.write(`${paint("○", ansi.guide)} ${paint("Thinking", ansi.dim)} ${paint(model, ansi.guide)}\n`);
    },
    token: (token) => {
      if (!receivedToken) {
        receivedToken = true;
        options.write(`${paint("●", ansi.green)} ${paint("Dream", ansi.bold)} ${paint(model, ansi.guide)}\n`);
      }
      characterCount += token.length;
      atLineStart = writeWithRail(token, atLineStart, options.write);
    },
    finish: () => {
      if (!receivedToken) {
        options.write(`${paint("●", ansi.green)} ${paint("Dream", ansi.bold)}\n`);
        options.write(`${responseRail()}${paint("No response received.", ansi.dim)}\n`);
      } else if (!atLineStart) {
        options.write("\n");
      }
      options.write(`${paint("✓", ansi.green)} ${paint("Done", ansi.dim)} ${paint(responseStats(startedAt, now(), characterCount), ansi.guide)}\n`);
    },
    fail: (message, tone) => {
      if (!atLineStart) {
        options.write("\n");
      }
      const color = tone === "warn" ? ansi.yellow : ansi.red;
      options.write(`${paint("✕", color)} ${paint("Error", `${ansi.bold}${color}`)}\n`);
      options.write(`${responseRail()}${paint(message, color)}\n`);
    },
  };
}

function writeWithRail(
  text: string,
  lineStart: boolean,
  write: (text: string) => void,
): boolean {
  let atLineStart = lineStart;
  let cursor = 0;

  while (cursor < text.length) {
    const segmentStartsLine = atLineStart;
    if (atLineStart) {
      write(responseRail());
      atLineStart = false;
    }

    const newlineIndex = text.indexOf("\n", cursor);
    if (newlineIndex === -1) {
      write(renderMarkdownSegment(text.slice(cursor), segmentStartsLine));
      return atLineStart;
    }

    write(`${renderMarkdownSegment(text.slice(cursor, newlineIndex), segmentStartsLine)}\n`);
    atLineStart = true;
    cursor = newlineIndex + 1;
  }

  return atLineStart;
}

function modelLabel(selectedModel: SelectedModel): string {
  return `${selectedModel.provider}/${selectedModel.model} · ${selectedModel.tier}`;
}

function responseRail(): string {
  return `${paint("│", ansi.guide)} `;
}

function renderMarkdownSegment(segment: string, lineStart: boolean): string {
  const blockStyled = lineStart ? renderMarkdownLineStart(segment) : segment;
  return renderInlineMarkdown(blockStyled);
}

function renderMarkdownLineStart(segment: string): string {
  const heading = /^(#{1,6})\s+(.+)$/u.exec(segment);
  if (heading !== null) {
    return `${paint(heading[1] ?? "", ansi.guide)} ${paint(heading[2] ?? "", `${ansi.bold}${ansi.accent}`)}`;
  }

  const unordered = /^(\s*)[-*]\s+(.+)$/u.exec(segment);
  if (unordered !== null) {
    return `${unordered[1] ?? ""}${paint("•", ansi.guide)} ${unordered[2] ?? ""}`;
  }

  const ordered = /^(\s*)(\d+\.)\s+(.+)$/u.exec(segment);
  if (ordered !== null) {
    return `${ordered[1] ?? ""}${paint(ordered[2] ?? "", ansi.guide)} ${ordered[3] ?? ""}`;
  }

  return segment;
}

function renderInlineMarkdown(segment: string): string {
  return segment
    .replace(/\*\*([^*\n]+)\*\*/gu, (_match, text: string) => paint(text, ansi.bold))
    .replace(/`([^`\n]+)`/gu, (_match, text: string) => renderInlineCode(text))
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/gu, (_match, label: string, url: string) => {
      return `${paint(label, ansi.blue)}${paint(` (${url})`, ansi.dim)}`;
    });
}

function renderInlineCode(text: string): string {
  const color = isFileReference(text) ? ansi.blue : ansi.yellow;
  return `${paint("`", ansi.dim)}${paint(text, color)}${paint("`", ansi.dim)}`;
}

function isFileReference(text: string): boolean {
  return /(^|[/\\])[^/\\]+\.[A-Za-z0-9]{1,8}$/u.test(text)
    || /[/\\]$/u.test(text)
    || text.includes("/")
    || text.includes("\\");
}

function responseStats(startedAt: number, finishedAt: number, characterCount: number): string {
  return `${formatElapsed(finishedAt - startedAt)} · ~${estimateTokens(characterCount)} tokens`;
}

function formatElapsed(milliseconds: number): string {
  if (milliseconds < 1_000) {
    return `${Math.max(0, milliseconds)}ms`;
  }
  return `${(milliseconds / 1_000).toFixed(1)}s`;
}

function estimateTokens(characterCount: number): number {
  return Math.max(0, Math.ceil(characterCount / 4));
}
