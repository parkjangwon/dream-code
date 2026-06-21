import { spawn } from "node:child_process";

import type { AgentToolName, AgentToolRequest } from "./agent-tool-schema.js";
import { toolRequestSchema } from "./agent-tool-schema.js";
import { ansi, paint } from "./ansi.js";
import { defaultConfigRoot, type PermissionMode } from "./config.js";
import { callConfiguredMcpTool } from "./mcp-client.js";
import { toolLabel, toolResultLabel } from "./agent-tool-labels.js";
import {
  deleteWorkspacePath,
  listWorkspacePath,
  mkdirWorkspacePath,
  readWorkspaceFile,
  replaceInWorkspaceFile,
  searchWorkspaceText,
  writeWorkspaceFile,
} from "./workspace-tools.js";
import { runResearch } from "./research-tool.js";
import { notifyPermissionRequired } from "./notifications.js";
import { riskyShellReason } from "./shell-safety.js";

export type { AgentToolName, AgentToolRequest } from "./agent-tool-schema.js";

export type AgentToolResult = {
  readonly request: AgentToolRequest;
  readonly ok: boolean;
  readonly output: string;
  readonly changedPath?: string;
};
export type AgentToolPolicy = {
  readonly mode: PermissionMode;
  readonly allowedTools?: readonly AgentToolName[];
  readonly approveTool?: (request: AgentToolRequest) => Promise<boolean>;
  readonly workspaceRoot?: string;
  readonly signal?: AbortSignal;
  readonly shellTimeoutMs?: number;
  readonly configRoot?: string;
};

const maxShellOutput = 12_000;
const defaultShellTimeoutMs = 120_000;

export function extractAgentToolRequests(text: string): readonly AgentToolRequest[] {
  const fenced = [...text.matchAll(/```dream-tool\s*\n([\s\S]*?)```/gu)]
    .flatMap((match) => parseToolLines(match[1] ?? ""))
    .slice(0, 12);
  return fenced.length > 0 ? fenced : parseBareToolObjects(text).slice(0, 12);
}

export async function runAgentToolRequest(
  request: AgentToolRequest,
  policyInput: PermissionMode | AgentToolPolicy,
): Promise<AgentToolResult> {
  const policy = normalizePolicy(policyInput);
  if (!toolAllowed(request.tool, policy.allowedTools)) {
    return { request, ok: false, output: `Tool ${request.tool} is not allowed for this agent.` };
  }
  if (!readOnlyTool(request.tool) && policy.mode !== "yolo") {
    if (policy.approveTool !== undefined && await policy.approveTool(request)) {
      return runApprovedAgentToolRequest(request, policy);
    }
    await notifyPermissionRequired(policy.configRoot ?? defaultConfigRoot(), toolLabel(request));
    return { request, ok: false, output: "Permission required. Enable YOLO or run the command manually." };
  }

  return runApprovedAgentToolRequest(request, policy);
}

async function runApprovedAgentToolRequest(
  request: AgentToolRequest,
  policy: AgentToolPolicy,
): Promise<AgentToolResult> {
  try {
    switch (request.tool) {
      case "read": {
        const result = await readWorkspaceFile(request.path, 8_000, policy.workspaceRoot);
        return { request, ok: true, output: `${result.path} (${result.bytes} bytes)\n${result.content}` };
      }
      case "list":
        return { request, ok: true, output: await listWorkspacePath(request.path, policy.workspaceRoot) };
      case "search": {
        const results = await searchWorkspaceText(request.query, request.path, policy.workspaceRoot);
        return { request, ok: true, output: formatSearchResults(results) };
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
        const path = await writeWorkspaceFile(request.path, request.content, policy.workspaceRoot);
        return { request, ok: true, output: `wrote ${path}`, changedPath: path };
      }
      case "delete": {
        const path = await deleteWorkspacePath(request.path, policy.workspaceRoot);
        return { request, ok: true, output: `deleted ${path}`, changedPath: path };
      }
      case "mkdir": {
        const path = await mkdirWorkspacePath(request.path, policy.workspaceRoot);
        return { request, ok: true, output: `created directory ${path}`, changedPath: path };
      }
      case "edit": {
        const result = await replaceInWorkspaceFile(request.path, request.search, request.replace, policy.workspaceRoot);
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
    return parseToolJson(line);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }
}

function parseBareToolObjects(text: string): readonly AgentToolRequest[] {
  if (!/["']tool["']\s*:/u.test(text)) {
    return [];
  }
  return [...text.matchAll(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gu)]
    .flatMap((match) => parseToolJson(match[0] ?? ""));
}

function parseToolJson(raw: string): readonly AgentToolRequest[] {
  const parsedJson = parseJsonObject(raw) ?? parseJsonObject(normalizeLooseJson(raw));
  const parsed = toolRequestSchema.safeParse(parsedJson);
  return parsed.success ? [parsed.data] : [];
}

function parseJsonObject(raw: string | undefined): unknown {
  if (raw === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

function normalizeLooseJson(raw: string): string {
  return raw.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/gu, (_match, value: string) => {
    return JSON.stringify(value.replace(/\\'/gu, "'"));
  });
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

function formatSearchResults(results: readonly { readonly path: string; readonly line: number; readonly text: string }[]): string {
  return results.length === 0 ? "no matches" : results.map((result) => `${result.path}:${result.line}: ${result.text}`).join("\n");
}

function normalizePolicy(policyInput: PermissionMode | AgentToolPolicy): AgentToolPolicy {
  return typeof policyInput === "string" ? { mode: policyInput } : policyInput;
}

function toolAllowed(tool: AgentToolName, allowedTools: readonly AgentToolName[] | undefined): boolean {
  return allowedTools === undefined || allowedTools.includes(tool);
}

function readOnlyTool(tool: AgentToolName): boolean {
  return tool === "read" || tool === "list" || tool === "search" || tool === "research";
}

function assertNever(value: never): never {
  throw new Error(`Unexpected tool request: ${String(value)}`);
}
