import type { AgentToolName, AgentToolRequest } from "./agent-tool-schema.js";
import { ansi, paint } from "./ansi.js";
import { defaultConfigRoot, type PermissionMode } from "./config.js";
import { saveFileCheckpoint } from "./file-history.js";
import { callConfiguredMcpTool } from "./mcp-client.js";
import { runShellCapture } from "./agent-shell-tool.js";
import { toolLabel, toolResultLabel } from "./agent-tool-labels.js";
import { globWorkspaceFiles, grepWorkspaceText } from "./workspace-search-tools.js";
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

export type { AgentToolName, AgentToolRequest } from "./agent-tool-schema.js";
export { extractAgentToolRequests } from "./agent-tool-parser.js";

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

export async function runAgentToolRequest(
  request: AgentToolRequest,
  policyInput: PermissionMode | AgentToolPolicy,
): Promise<AgentToolResult> {
  const policy = normalizePolicy(policyInput);
  if (!toolAllowed(request.tool, policy.allowedTools)) {
    return { request, ok: false, output: `Tool ${request.tool} is not allowed for this agent.` };
  }
  if (!readOnlyTool(request.tool) && policy.mode === "plan") {
    return { request, ok: false, output: `Plan mode blocks ${toolLabel(request)}. Switch to ask, auto, or yolo before changing files or running mutating tools.` };
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
        const result = await readWorkspaceFile(request.path, {
          maxChars: 8_000,
          ...(request.startLine === undefined ? {} : { startLine: request.startLine }),
          ...(request.endLine === undefined ? {} : { endLine: request.endLine }),
        }, policy.workspaceRoot);
        return { request, ok: true, output: formatReadOutput(result, request.startLine, request.endLine) };
      }
      case "list":
        return { request, ok: true, output: await listWorkspacePath(request.path, policy.workspaceRoot) };
      case "search": {
        const results = await searchWorkspaceText(request.query, request.path, policy.workspaceRoot);
        return { request, ok: true, output: formatSearchResults(results) };
      }
      case "grep": {
        const results = await grepWorkspaceText({
          query: request.query,
          ...(request.path === undefined ? {} : { path: request.path }),
          ...(request.regex === undefined ? {} : { regex: request.regex }),
          ...(request.glob === undefined ? {} : { glob: request.glob }),
          ...(request.caseSensitive === undefined ? {} : { caseSensitive: request.caseSensitive }),
          ...(request.contextLines === undefined ? {} : { contextLines: request.contextLines }),
        }, policy.workspaceRoot);
        return { request, ok: true, output: formatSearchResults(results) };
      }
      case "glob": {
        const results = await globWorkspaceFiles(request.pattern, request.path, policy.workspaceRoot, request.maxResults);
        return { request, ok: true, output: results.length === 0 ? "no matches" : results.join("\n") };
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
        const checkpoint = await checkpointPathBeforeMutation(request.path, policy);
        const path = await writeWorkspaceFile(request.path, request.content, policy.workspaceRoot);
        return { request, ok: true, output: formatMutationOutput(`wrote ${path}`, checkpoint), changedPath: path };
      }
      case "delete": {
        const checkpoint = await checkpointPathBeforeMutation(request.path, policy);
        const path = await deleteWorkspacePath(request.path, policy.workspaceRoot);
        return { request, ok: true, output: formatMutationOutput(`deleted ${path}`, checkpoint), changedPath: path };
      }
      case "mkdir": {
        const path = await mkdirWorkspacePath(request.path, policy.workspaceRoot);
        return { request, ok: true, output: `created directory ${path}`, changedPath: path };
      }
      case "edit": {
        const checkpoint = await checkpointPathBeforeMutation(request.path, policy);
        const result = await replaceInWorkspaceFile(request.path, request.search, request.replace, {
          ...(request.replaceAll === undefined ? {} : { replaceAll: request.replaceAll }),
          ...(request.expectedReplacements === undefined ? {} : { expectedReplacements: request.expectedReplacements }),
        }, policy.workspaceRoot);
        return {
          request,
          ok: result.replaced,
          output: result.replaced
            ? formatMutationOutput(`edited ${result.path} (${result.replacements} replacements)`, checkpoint)
            : result.message ?? `no match in ${result.path}`,
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

function formatSearchResults(results: readonly { readonly path: string; readonly line: number; readonly text: string }[]): string {
  return results.length === 0 ? "no matches" : results.map((result) => `${result.path}:${result.line}: ${result.text}`).join("\n");
}

function formatReadOutput(
  result: { readonly path: string; readonly bytes: number; readonly content: string },
  startLine: number | undefined,
  endLine: number | undefined,
): string {
  const range = startLine === undefined && endLine === undefined ? "" : ` lines ${startLine ?? 1}-${endLine ?? "end"}`;
  return `${result.path} (${result.bytes} bytes${range})\n${result.content}`;
}

function normalizePolicy(policyInput: PermissionMode | AgentToolPolicy): AgentToolPolicy {
  return typeof policyInput === "string" ? { mode: policyInput } : policyInput;
}

async function checkpointPathBeforeMutation(path: string, policy: AgentToolPolicy): Promise<string | undefined> {
  const checkpoint = await saveFileCheckpoint(path, policy.workspaceRoot, policy.configRoot ?? defaultConfigRoot());
  return checkpoint?.snapshotPath;
}

function formatMutationOutput(output: string, checkpoint: string | undefined): string {
  return checkpoint === undefined ? output : `${output}\ncheckpoint: ${checkpoint}`;
}

function toolAllowed(tool: AgentToolName, allowedTools: readonly AgentToolName[] | undefined): boolean {
  return allowedTools === undefined || allowedTools.includes(tool);
}

function readOnlyTool(tool: AgentToolName): boolean {
  return tool === "read" || tool === "list" || tool === "search" || tool === "grep" || tool === "glob" || tool === "research";
}

function assertNever(value: never): never {
  throw new Error(`Unexpected tool request: ${String(value)}`);
}
