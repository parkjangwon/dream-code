import type { AgentToolName, AgentToolRequest } from "./agent-tool-schema.js";
import { defaultConfigRoot, type PermissionMode } from "./config.js";
import { formatReadOutput, formatSearchResults, formatToolProgress } from "./agent-tool-output.js";
import { formatPermissionPreview } from "./agent-tool-permission-preview.js";
import { saveFileCheckpoint, type FileCheckpoint } from "./file-history.js";
import { callConfiguredMcpTool } from "./mcp-client.js";
import { runDiagnosticsTool, runFetchTool } from "./agent-tool-external.js";
import { runArtifactTool, runTaskTool } from "./agent-tool-state.js";
import {
  runCopyTool,
  runDiffTool,
  runMoveTool,
  runPatchTool,
  runStatTool,
} from "./agent-tool-workspace.js";
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
  readonly checkpoint?: FileCheckpoint;
};
export type AgentToolPolicy = {
  readonly mode: PermissionMode;
  readonly allowedTools?: readonly AgentToolName[];
  readonly approveTool?: (request: AgentToolRequest) => Promise<boolean>;
  readonly workspaceRoot?: string;
  readonly signal?: AbortSignal;
  readonly shellTimeoutMs?: number;
  readonly shellAllowedExecutables?: readonly string[];
  readonly configRoot?: string;
};

export { formatToolProgress, formatToolResults } from "./agent-tool-output.js";

export async function runAgentToolRequest(
  request: AgentToolRequest,
  policyInput: PermissionMode | AgentToolPolicy,
): Promise<AgentToolResult> {
  const policy = normalizePolicy(policyInput);
  if (!toolAllowed(request.tool, policy.allowedTools)) {
    return { request, ok: false, output: `Tool ${request.tool} is not allowed for this agent.` };
  }
  if (requestMutates(request) && policy.mode === "plan") {
    return { request, ok: false, output: `Plan mode blocks ${toolLabel(request)}. Switch to ask, auto, or yolo before changing files or running mutating tools.\n${formatPermissionPreview(request)}` };
  }
  if (requestMutates(request) && policy.mode !== "yolo") {
    if (policy.approveTool !== undefined && await policy.approveTool(request)) {
      return runApprovedAgentToolRequest(request, policy);
    }
    await notifyPermissionRequired(policy.configRoot ?? defaultConfigRoot(), toolLabel(request));
    return { request, ok: false, output: `Permission required. Enable YOLO or run the command manually.\n${formatPermissionPreview(request)}` };
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
      case "fetch":
        return { request, ...(await runFetchTool(request, policy.signal)) };
      case "diff":
        return { request, ok: true, output: await runDiffTool(request, workspacePolicy(policy)) };
      case "stat":
        return { request, ok: true, output: await runStatTool(request, workspacePolicy(policy)) };
      case "diagnostics":
        return { request, ok: true, output: await runDiagnosticsTool(policy.workspaceRoot ?? process.cwd()) };
      case "mcp": {
        const output = await callConfiguredMcpTool(policy.configRoot ?? defaultConfigRoot(), request, policy.signal);
        return { request, ok: true, output };
      }
      case "shell":
        return {
          request,
          ...(await runShellCapture(request.command, {
            ...(policy.signal === undefined ? {} : { signal: policy.signal }),
            ...(policy.shellTimeoutMs === undefined ? {} : { shellTimeoutMs: policy.shellTimeoutMs }),
            ...(policy.shellAllowedExecutables === undefined ? {} : { allowedExecutables: policy.shellAllowedExecutables }),
          })),
        };
      case "write": {
        const checkpoint = await checkpointPathBeforeMutation(request.path, policy);
        const path = await writeWorkspaceFile(request.path, request.content, policy.workspaceRoot);
        return { request, ok: true, output: formatMutationOutput(`wrote ${path}`, checkpoint?.snapshotPath), changedPath: path, ...(checkpoint === undefined ? {} : { checkpoint }) };
      }
      case "delete": {
        const checkpoint = await checkpointPathBeforeMutation(request.path, policy);
        const path = await deleteWorkspacePath(request.path, policy.workspaceRoot);
        return { request, ok: true, output: formatMutationOutput(`deleted ${path}`, checkpoint?.snapshotPath), changedPath: path, ...(checkpoint === undefined ? {} : { checkpoint }) };
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
            ? formatMutationOutput(`edited ${result.path} (${result.replacements} replacements)`, checkpoint?.snapshotPath)
            : result.message ?? `no match in ${result.path}`,
          ...(result.replaced ? { changedPath: result.path } : {}),
          ...(result.replaced && checkpoint !== undefined ? { checkpoint } : {}),
        };
      }
      case "patch": {
        const result = await runPatchTool(request, workspacePolicy(policy));
        return { request, ok: true, ...result };
      }
      case "move": {
        const result = await runMoveTool(request, workspacePolicy(policy));
        return { request, ok: true, ...result };
      }
      case "copy": {
        const result = await runCopyTool(request, workspacePolicy(policy));
        return { request, ok: true, ...result };
      }
      case "artifact": {
        const result = await runArtifactTool(request, policy.configRoot ?? defaultConfigRoot());
        return { request, ok: true, ...result };
      }
      case "task":
        return { request, ok: true, output: await runTaskTool(request, policy.configRoot ?? defaultConfigRoot()) };
      default:
        return assertNever(request);
    }
  } catch (error) {
    return { request, ok: false, output: error instanceof Error ? error.message : "Unknown tool error" };
  }
}

function normalizePolicy(policyInput: PermissionMode | AgentToolPolicy): AgentToolPolicy {
  return typeof policyInput === "string" ? { mode: policyInput } : policyInput;
}

async function checkpointPathBeforeMutation(path: string, policy: AgentToolPolicy): Promise<FileCheckpoint | undefined> {
  return saveFileCheckpoint(path, policy.workspaceRoot, policy.configRoot ?? defaultConfigRoot());
}

function formatMutationOutput(output: string, checkpoint: string | undefined): string {
  return checkpoint === undefined ? output : `${output}\ncheckpoint: ${checkpoint}`;
}

function toolAllowed(tool: AgentToolName, allowedTools: readonly AgentToolName[] | undefined): boolean {
  return allowedTools === undefined || allowedTools.includes(tool);
}

function requestMutates(request: AgentToolRequest): boolean {
  switch (request.tool) {
    case "read":
    case "list":
    case "search":
    case "grep":
    case "glob":
    case "research":
    case "fetch":
    case "diff":
    case "stat":
    case "diagnostics":
      return false;
    case "artifact":
      return request.action === "write" || request.action === "delete";
    case "task":
      return request.action === "add" || request.action === "update";
    case "shell":
    case "mcp":
    case "write":
    case "delete":
    case "mkdir":
    case "edit":
    case "patch":
    case "move":
    case "copy":
      return true;
    default:
      return assertNever(request);
  }
}

function workspacePolicy(policy: AgentToolPolicy): { readonly workspaceRoot: string; readonly configRoot: string; readonly signal?: AbortSignal } {
  return {
    workspaceRoot: policy.workspaceRoot ?? process.cwd(),
    configRoot: policy.configRoot ?? defaultConfigRoot(),
    ...(policy.signal === undefined ? {} : { signal: policy.signal }),
  };
}

function assertNever(value: never): never {
  throw new Error(`Unexpected tool request: ${String(value)}`);
}
