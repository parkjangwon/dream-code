import { spawn } from "node:child_process";
import { z } from "zod";

import { ansi, paint } from "./ansi.js";
import { defaultConfigRoot, type PermissionMode } from "./config.js";
import { callConfiguredMcpTool } from "./mcp-client.js";
import {
  readWorkspaceFile,
  replaceInWorkspaceFile,
  writeWorkspaceFile,
} from "./workspace-tools.js";
import { runResearch } from "./research-tool.js";
import { riskyShellReason } from "./shell-safety.js";

const toolNameSchema = z.enum(["read", "research", "shell", "write", "edit", "mcp"]);
const toolRequestBaseSchema = z.object({ id: z.string().min(1).optional() });
const readRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("read"), path: z.string().min(1) });
const researchRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("research"), query: z.string().min(1) });
const shellRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("shell"), command: z.string().min(1) });
const writeRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("write"), path: z.string().min(1), content: z.string() });
const mcpRequestSchema = toolRequestBaseSchema.extend({
  tool: z.literal("mcp"),
  server: z.string().min(1),
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
});
const editRequestSchema = toolRequestBaseSchema.extend({
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
  mcpRequestSchema,
]);

export type AgentToolName = z.infer<typeof toolNameSchema>;
export type AgentToolRequest = z.infer<typeof toolRequestSchema>;
export type AgentToolResult = {
  readonly request: AgentToolRequest;
  readonly ok: boolean;
  readonly output: string;
  readonly changedPath?: string;
};
export type AgentToolPolicy = {
  readonly mode: PermissionMode;
  readonly allowedTools?: readonly AgentToolName[];
  readonly signal?: AbortSignal;
  readonly shellTimeoutMs?: number;
  readonly configRoot?: string;
};

const maxShellOutput = 12_000;
const defaultShellTimeoutMs = 120_000;

export function extractAgentToolRequests(text: string): readonly AgentToolRequest[] {
  return [...text.matchAll(/```dream-tool\s*\n([\s\S]*?)```/gu)]
    .flatMap((match) => parseToolLines(match[1] ?? ""))
    .slice(0, 8);
}

export async function runAgentToolRequest(
  request: AgentToolRequest,
  policyInput: PermissionMode | AgentToolPolicy,
): Promise<AgentToolResult> {
  const policy = normalizePolicy(policyInput);
  if (!toolAllowed(request.tool, policy.allowedTools)) {
    return { request, ok: false, output: `Tool ${request.tool} is not allowed for this agent.` };
  }
  if (request.tool !== "read" && request.tool !== "research" && policy.mode !== "yolo") {
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
      case "mcp": {
        const output = await callConfiguredMcpTool(policy.configRoot ?? defaultConfigRoot(), request, policy.signal);
        return { request, ok: true, output };
      }
      case "shell":
        return { request, ...(await runShellCapture(request.command, policy)) };
      case "write": {
        const path = await writeWorkspaceFile(request.path, request.content);
        return { request, ok: true, output: `wrote ${path}`, changedPath: path };
      }
      case "edit": {
        const result = await replaceInWorkspaceFile(request.path, request.search, request.replace);
        return {
          request,
          ok: result.replaced,
          output: result.replaced ? `edited ${result.path}` : `no match in ${result.path}`,
          ...(result.replaced ? { changedPath: result.path } : {}),
        };
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

function runShellCapture(
  command: string,
  policy: Pick<AgentToolPolicy, "signal" | "shellTimeoutMs">,
): Promise<Pick<AgentToolResult, "ok" | "output">> {
  return new Promise((resolve) => {
    const risk = riskyShellReason(command);
    if (policy.signal?.aborted === true) {
      resolve({ ok: false, output: shellOutput(risk, "cancelled") });
      return;
    }
    const child = spawn(command, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => {
      finish(false, `timed out after ${policy.shellTimeoutMs ?? defaultShellTimeoutMs}ms\n${output}`.trim());
      child.kill("SIGTERM");
    }, policy.shellTimeoutMs ?? defaultShellTimeoutMs);
    const abort = (): void => {
      finish(false, `cancelled\n${output}`.trim());
      child.kill("SIGTERM");
    };
    const finish = (ok: boolean, text: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      policy.signal?.removeEventListener("abort", abort);
      resolve({ ok, output: shellOutput(risk, text) });
    };
    policy.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      finish(false, error.message);
    });
    child.on("close", (code) => {
      finish(code === 0, `exit ${code ?? 1}\n${output}`.trim());
    });
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
    case "mcp":
      return `mcp ${request.server}/${request.name}`;
    default:
      return assertNever(request);
  }
}

function toolResultLabel(request: AgentToolRequest): string {
  return request.id === undefined ? toolLabel(request) : `${request.id} ${toolLabel(request)}`;
}

function normalizePolicy(policyInput: PermissionMode | AgentToolPolicy): AgentToolPolicy {
  return typeof policyInput === "string" ? { mode: policyInput } : policyInput;
}

function toolAllowed(tool: AgentToolName, allowedTools: readonly AgentToolName[] | undefined): boolean {
  return allowedTools === undefined || allowedTools.includes(tool);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected tool request: ${String(value)}`);
}
