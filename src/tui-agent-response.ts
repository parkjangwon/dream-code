import { ansi, paint } from "./ansi.js";
import type { SelectedModel } from "./model-routing.js";
import { createThinkingAnimation } from "./thinking-animation.js";
import type { IntervalClearer, IntervalScheduler } from "./thinking-animation.js";
import {
  isMarkdownTableDivider,
  isMarkdownTableRow,
  renderMarkdownTable,
} from "./tui-markdown-table.js";

export type AgentResponseSession = {
  readonly start: () => void;
  readonly token: (token: string) => void;
  readonly finish: () => void;
  readonly fail: (message: string, tone: "warn" | "error") => void;
  readonly stop: () => void;
};

export type AgentResponseSessionOptions = {
  readonly selectedModel: SelectedModel;
  readonly write: (text: string) => void;
  readonly now?: () => number;
  readonly setInterval?: IntervalScheduler;
  readonly clearInterval?: IntervalClearer;
  readonly thinkingAnimationIntervalMs?: number;
};

type MarkdownState = {
  readonly inFence: boolean;
};

type RenderedMarkdownLine = {
  readonly text: string;
  readonly state: MarkdownState;
};

export function createAgentResponseSession(options: AgentResponseSessionOptions): AgentResponseSession {
  const now = options.now ?? Date.now;
  const startedAt = now();
  let receivedToken = false;
  let characterCount = 0;
  let lineBuffer = "";
  let markdownState: MarkdownState = { inFence: false };
  let tableBuffer: readonly string[] = [];

  const model = modelLabel(options.selectedModel);
  const thinkingAnimation = createThinkingAnimation({
    label: model,
    write: options.write,
    ...(options.setInterval === undefined ? {} : { setInterval: options.setInterval }),
    ...(options.clearInterval === undefined ? {} : { clearInterval: options.clearInterval }),
    ...(options.thinkingAnimationIntervalMs === undefined ? {} : { intervalMs: options.thinkingAnimationIntervalMs }),
  });
  const writeRenderedLine = (line: string): void => {
    options.write(`${responseRail()}${line}\n`);
  };
  const flushTable = (): void => {
    if (tableBuffer.length === 0) {
      return;
    }
    for (const line of renderMarkdownTable(tableBuffer, renderInlineMarkdown)) {
      writeRenderedLine(line);
    }
    tableBuffer = [];
  };
  const writeLine = (line: string): void => {
    if (!markdownState.inFence && (isMarkdownTableRow(line) || isMarkdownTableDivider(line))) {
      tableBuffer = [...tableBuffer, line];
      return;
    }

    flushTable();
    const rendered = renderMarkdownLine(line, markdownState);
    markdownState = rendered.state;
    writeRenderedLine(rendered.text);
  };
  const flushLineBuffer = (): void => {
    if (lineBuffer.length === 0) {
      flushTable();
      return;
    }
    writeLine(lineBuffer);
    lineBuffer = "";
    flushTable();
  };

  return {
    start: () => {
      thinkingAnimation.start();
    },
    token: (token) => {
      if (!receivedToken) {
        receivedToken = true;
        thinkingAnimation.stop();
        options.write(`${paint("⣿", ansi.green)} ${paint("Dream", ansi.bold)} ${paint(model, ansi.guide)}\n`);
      }
      characterCount += token.length;
      lineBuffer = writeBufferedLines(token, lineBuffer, writeLine);
    },
    finish: () => {
      thinkingAnimation.stop();
      if (!receivedToken) {
        options.write(`${paint("●", ansi.green)} ${paint("Dream", ansi.bold)}\n`);
        options.write(`${responseRail()}${paint("No response received.", ansi.dim)}\n`);
      } else {
        flushLineBuffer();
      }
      options.write(`${paint("✓", ansi.green)} ${paint("Done", ansi.dim)} ${paint(responseStats(startedAt, now(), characterCount), ansi.guide)}\n`);
    },
    fail: (message, tone) => {
      thinkingAnimation.stop();
      flushLineBuffer();
      const color = tone === "warn" ? ansi.yellow : ansi.red;
      options.write(`${paint("✕", color)} ${paint("Error", `${ansi.bold}${color}`)}\n`);
      options.write(`${responseRail()}${paint(message, color)}\n`);
    },
    stop: () => {
      thinkingAnimation.stop();
    },
  };
}

function writeBufferedLines(
  text: string,
  initialBuffer: string,
  writeLine: (line: string) => void,
): string {
  let lineBuffer = initialBuffer;
  let cursor = 0;

  while (cursor < text.length) {
    const newlineIndex = text.indexOf("\n", cursor);
    if (newlineIndex === -1) {
      return `${lineBuffer}${text.slice(cursor)}`;
    }

    lineBuffer = `${lineBuffer}${text.slice(cursor, newlineIndex)}`;
    writeLine(lineBuffer);
    lineBuffer = "";
    cursor = newlineIndex + 1;
  }

  return lineBuffer;
}

function modelLabel(selectedModel: SelectedModel): string {
  if (selectedModel.reason.startsWith("auto ")) {
    const lane = selectedModel.agent ?? selectedModel.category ?? "routing";
    return `AUTO ${lane} · ${selectedModel.tier} → ${selectedModel.provider}/${selectedModel.model}`;
  }
  return `${selectedModel.provider}/${selectedModel.model} · ${selectedModel.tier}`;
}

function responseRail(): string {
  return `${paint("│", ansi.guide)} `;
}

function renderMarkdownLine(line: string, state: MarkdownState): RenderedMarkdownLine {
  const fence = /^```([A-Za-z0-9_-]+)?\s*$/u.exec(line.trim());
  if (fence !== null) {
    return state.inFence
      ? { text: paint("╰─", ansi.guide), state: { inFence: false } }
      : {
        text: paint(`╭─ ${fence[1] ?? "code"}`, ansi.guide),
        state: { inFence: true },
      };
  }

  if (state.inFence) {
    return {
      text: `${paint("  ", ansi.guide)}${paint(line, ansi.yellow)}`,
      state,
    };
  }

  const blockStyled = renderMarkdownLineStart(line);
  return { text: renderInlineMarkdown(blockStyled), state };
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
