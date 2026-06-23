import { readFile } from "node:fs/promises";

import { stripAnsi } from "./ansi.js";
import type { AgentRunRecord } from "./agent-run-record.js";

export async function readAgentRunPreview(run: AgentRunRecord, limit = 320): Promise<string> {
  const output = await readOptionalFile(run.outputPath);
  const fallback = run.error ?? run.prompt;
  const source = output.trim().length > 0 ? readableOutputPreview(stripAnsi(output)) || fallback : fallback;
  return truncate(oneLine(source), limit);
}

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function oneLine(text: string): string {
  return text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0).join(" ");
}

function readableOutputPreview(text: string): string {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isTransientOutputLine(line))
    .slice(-3)
    .join(" ");
}

function isTransientOutputLine(line: string): boolean {
  return line.includes(" Thinking ") || line.startsWith("Thinking ") || line.startsWith("◆ Tool ");
}

function truncate(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 3))}...`;
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
