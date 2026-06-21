import { spawn } from "node:child_process";
import { z } from "zod";

import { ansi, paint } from "./ansi.js";
import type { PermissionMode } from "./config.js";
import {
  readWorkspaceFile,
  replaceInWorkspaceFile,
  writeWorkspaceFile,
} from "./workspace-tools.js";
import { runResearch } from "./research-tool.js";
import { riskyShellReason } from "./shell-safety.js";

const readRequestSchema = z.object({ tool: z.literal("read"), path: z.string().min(1) });
const researchRequestSchema = z.object({ tool: z.literal("research"), query: z.string().min(1) });
const shellRequestSchema = z.object({ tool: z.literal("shell"), command: z.string().min(1) });
const writeRequestSchema = z.object({ tool: z.literal("write"), path: z.string().min(1), content: z.string() });
const editRequestSchema = z.object({
  tool: z.literal("edit"),
  path: z.string().min(1),
  search: z.string().min(1),
  replace: z.string(),
});
const toolRequestSchema = z.discriminatedUnion("tool", [
  readRequestSchema,
  researchRequestSchema,
  shellRequestSchema,
  writeRequestSchema,
  editRequestSchema,
]);

export type AgentToolRequest = z.infer<typeof toolRequestSchema>;
export type AgentToolResult = {
  readonly request: AgentToolRequest;
  readonly ok: boolean;
  readonly output: string;
};

const maxShellOutput = 12_000;

export function extractAgentToolRequests(text: string): readonly AgentToolRequest[] {
  return [...text.matchAll(/```dream-tool\s*\n([\s\S]*?)```/gu)]
    .flatMap((match) => parseToolLines(match[1] ?? ""))
    .slice(0, 8);
}

export async function runAgentToolRequest(
  request: AgentToolRequest,
  mode: PermissionMode,
): Promise<AgentToolResult> {
  if (request.tool !== "read" && request.tool !== "research" && mode !== "yolo") {
    return { request, ok: false, output: "Permission required. Enable YOLO or run the command manually." };
  }

  try {
    switch (request.tool) {
      case "read": {
        const result = await readWorkspaceFile(request.path);
        return { request, ok: true, output: `${result.path} (${result.bytes} bytes)\n${result.content}` };
      }
      case "research": {
        const result = await runResearch(request.query);
        return { request, ok: result.ok, output: result.output };
      }
      case "shell":
        return { request, ...(await runShellCapture(request.command)) };
      case "write": {
        const path = await writeWorkspaceFile(request.path, request.content);
        return { request, ok: true, output: `wrote ${path}` };
      }
      case "edit": {
        const result = await replaceInWorkspaceFile(request.path, request.search, request.replace);
        return { request, ok: result.replaced, output: result.replaced ? `edited ${result.path}` : `no match in ${result.path}` };
      }
      default:
        return assertNever(request);
    }
  } catch (error) {
    return { request, ok: false, output: error instanceof Error ? error.message : "Unknown tool error" };
  }
}

export function formatToolResults(results: readonly AgentToolResult[]): string {
  return [
    "Dream Code tool results:",
    ...results.map((result) => [
      `- ${result.ok ? "ok" : "failed"} ${toolLabel(result.request)}`,
      result.output,
    ].join("\n")),
    "Continue from these results. If more local data is needed, request another dream-tool block.",
  ].join("\n\n");
}

export function formatToolProgress(result: AgentToolResult): string {
  const marker = result.ok ? paint("◆", ansi.green) : paint("◆", ansi.yellow);
  return `${marker} ${paint("Tool", ansi.bold)} ${paint(toolLabel(result.request), ansi.blue)}\n`;
}

function parseToolLines(raw: string): readonly AgentToolRequest[] {
  return raw.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0).flatMap(parseToolLine);
}

function parseToolLine(line: string): readonly AgentToolRequest[] {
  try {
    const parsedJson: unknown = JSON.parse(line);
    const parsed = toolRequestSchema.safeParse(parsedJson);
    return parsed.success ? [parsed.data] : [];
  } catch (error) {
    if (error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }
}

function runShellCapture(command: string): Promise<Pick<AgentToolResult, "ok" | "output">> {
  return new Promise((resolve) => {
    const risk = riskyShellReason(command);
    const child = spawn(command, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.on("error", (error) => resolve({ ok: false, output: shellOutput(risk, error.message) }));
    child.on("close", (code) => resolve({ ok: code === 0, output: shellOutput(risk, `exit ${code ?? 1}\n${output}`.trim()) }));
  });
}

function shellOutput(risk: string | undefined, output: string): string {
  return risk === undefined ? output : `risk: ${risk}\n${output}`;
}

function appendLimited(base: string, chunk: string): string {
  const next = `${base}${chunk}`;
  return next.length > maxShellOutput ? `${next.slice(0, maxShellOutput)}\n[truncated]` : next;
}

function toolLabel(request: AgentToolRequest): string {
  switch (request.tool) {
    case "read":
      return `read ${request.path}`;
    case "research":
      return `research ${request.query}`;
    case "shell":
      return `shell ${request.command}`;
    case "write":
      return `write ${request.path}`;
    case "edit":
      return `edit ${request.path}`;
    default:
      return assertNever(request);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected tool request: ${String(value)}`);
}
