import type { AgentRunHandle } from "./agent-run-record.js";
import { groupAgentToolRequests } from "./agent-tool-batch.js";
import type { AgentToolRequest } from "./agent-tool-schema.js";
import { formatToolProgress } from "./agent-tool-output.js";
import { runAgentToolRequest, type AgentToolPolicy, type AgentToolResult } from "./agent-tools.js";
import { runHookEvent } from "./hooks.js";

export type RunAgentToolGroupsOptions = {
  readonly configRoot: string;
  readonly run: AgentRunHandle;
  readonly requests: readonly AgentToolRequest[];
  readonly policy: AgentToolPolicy;
  readonly write: (text: string) => void;
};

export async function runAgentToolGroups(options: RunAgentToolGroupsOptions): Promise<readonly AgentToolResult[]> {
  const results: AgentToolResult[] = [];
  let sequence = 0;
  for (const [batchIndex, group] of groupAgentToolRequests(options.requests).entries()) {
    if (options.run.signal.aborted) {
      return results;
    }
    for (const request of group) {
      await runHookEvent(options.configRoot, "preTool", { tool: request.tool });
    }
    const batchId = `batch-${batchIndex + 1}`;
    const groupResults = await Promise.all(group.map(async (request) => {
      const startedAt = Date.now();
      return {
        request,
        result: await runAgentToolRequest(request, options.policy),
        durationMs: Date.now() - startedAt,
      };
    }));
    for (const item of groupResults) {
      sequence += 1;
      options.run.tool(item.result.request.tool, {
        ok: item.result.ok,
        ...(item.result.changedPath === undefined ? {} : { changedPath: item.result.changedPath }),
        checkpoints: item.result.checkpoint === undefined ? [] : [item.result.checkpoint],
        durationMs: item.durationMs,
        batchId,
        sequence,
        risk: toolRisk(item.result.request),
        ...failurePolicy(item.result),
      });
      await runHookEvent(options.configRoot, "postTool", { tool: item.result.request.tool, ok: String(item.result.ok) });
      options.write(formatToolProgress(item.result));
      results.push(item.result);
    }
  }
  return results;
}

function failurePolicy(result: AgentToolResult): { readonly failureClass?: "retryable" | "permission" | "terminal" | "unknown"; readonly recovery?: string; readonly nextAction?: string } {
  if (result.ok) {
    return {};
  }
  const failureClass = failureClassForToolFailure(result);
  return {
    failureClass,
    recovery: recoveryForToolFailure(result.request),
    nextAction: nextActionForFailure(failureClass, result.request),
  };
}

function failureClassForToolFailure(result: AgentToolResult): "retryable" | "permission" | "terminal" | "unknown" {
  if (/permission required|plan mode blocks/iu.test(result.output)) {
    return "permission";
  }
  switch (result.request.tool) {
    case "research":
    case "fetch":
    case "mcp":
    case "shell":
    case "diagnostics":
      return "retryable";
    case "write":
    case "delete":
    case "mkdir":
    case "edit":
    case "patch":
    case "move":
    case "copy":
      return "permission";
    case "read":
    case "list":
    case "search":
    case "grep":
    case "glob":
    case "diff":
    case "stat":
    case "artifact":
    case "task":
      return "terminal";
    default:
      return assertNever(result.request);
  }
}

function nextActionForFailure(
  failureClass: "retryable" | "permission" | "terminal" | "unknown",
  request: AgentToolRequest,
): string {
  switch (failureClass) {
    case "retryable":
      return "Retry once with the smallest safe command, then inspect logs before another attempt.";
    case "permission":
      return "Review the preview, approve the action, or ask for a non-mutating plan.";
    case "terminal":
      return "Inspect the target path or saved state before continuing.";
    case "unknown":
      return `Inspect ${request.tool} output before retrying.`;
    default:
      return assertNeverFailure(failureClass);
  }
}

function toolRisk(request: AgentToolRequest): "read-only" | "workspace-write" | "external" | "state" | "unknown" {
  switch (request.tool) {
    case "read":
    case "list":
    case "search":
    case "grep":
    case "glob":
    case "diff":
    case "stat":
    case "diagnostics":
      return "read-only";
    case "write":
    case "delete":
    case "mkdir":
    case "edit":
    case "patch":
    case "move":
    case "copy":
      return "workspace-write";
    case "research":
    case "fetch":
    case "mcp":
    case "shell":
      return "external";
    case "artifact":
    case "task":
      return "state";
    default:
      return assertNever(request);
  }
}

function recoveryForToolFailure(request: AgentToolRequest): string {
  switch (request.tool) {
    case "read":
    case "list":
    case "search":
    case "grep":
    case "glob":
    case "diff":
    case "stat":
    case "diagnostics":
      return "Retry with a narrower path or inspect the workspace before continuing.";
    case "write":
    case "delete":
    case "mkdir":
    case "edit":
    case "patch":
    case "move":
    case "copy":
      return "Review the preview, then approve the mutation or request a non-mutating plan.";
    case "research":
    case "fetch":
    case "mcp":
    case "shell":
      return "Check tool configuration and retry with the smallest safe command.";
    case "artifact":
    case "task":
      return "Inspect saved state and retry the state update with a narrower request.";
    default:
      return assertNever(request);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected tool request: ${String(value)}`);
}

function assertNeverFailure(value: never): never {
  throw new Error(`Unexpected failure class: ${String(value)}`);
}
