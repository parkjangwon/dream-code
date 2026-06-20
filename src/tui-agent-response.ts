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
    if (atLineStart) {
      write(responseRail());
      atLineStart = false;
    }

    const newlineIndex = text.indexOf("\n", cursor);
    if (newlineIndex === -1) {
      write(text.slice(cursor));
      return atLineStart;
    }

    write(text.slice(cursor, newlineIndex + 1));
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
