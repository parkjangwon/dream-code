import { ansi, paint } from "./ansi.js";
import { toolLabel, toolResultLabel } from "./agent-tool-labels.js";
import type { AgentToolResult } from "./agent-tools.js";

export function formatToolResults(results: readonly AgentToolResult[]): string {
  return [
    "Dream Code tool results:",
    ...results.map((result) => [
      `- ${result.ok ? "ok" : "failed"} ${toolResultLabel(result.request)}`,
      result.output,
    ].join("\n")),
    "Continue from these results. If more local data is needed, request another dream-tool block.",
  ].join("\n\n");
}

export function formatToolProgress(result: AgentToolResult): string {
  const marker = result.ok ? paint("◆", ansi.green) : paint("◆", ansi.yellow);
  return `${marker} ${paint("Tool", ansi.bold)} ${paint(toolLabel(result.request), ansi.blue)}\n`;
}

export function formatSearchResults(results: readonly { readonly path: string; readonly line: number; readonly text: string }[]): string {
  return results.length === 0 ? "no matches" : results.map((result) => `${result.path}:${result.line}: ${result.text}`).join("\n");
}

export function formatReadOutput(
  result: { readonly path: string; readonly bytes: number; readonly content: string },
  startLine: number | undefined,
  endLine: number | undefined,
): string {
  const range = startLine === undefined && endLine === undefined ? "" : ` lines ${startLine ?? 1}-${endLine ?? "end"}`;
  return `${result.path} (${result.bytes} bytes${range})\n${result.content}`;
}
