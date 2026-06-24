import type { AgentToolRequest } from "./agent-tool-schema.js";
import type { AgentToolResult } from "./agent-tools.js";

export type AgentToolRunner = (request: AgentToolRequest) => Promise<AgentToolResult>;
export type AgentToolRequestGroup = readonly AgentToolRequest[];

export async function runAgentToolBatch(
  requests: readonly AgentToolRequest[],
  runner: AgentToolRunner,
): Promise<readonly AgentToolResult[]> {
  const results: AgentToolResult[] = [];

  for (const group of groupAgentToolRequests(requests)) {
    results.push(...await Promise.all(group.map((request) => runner(request))));
  }

  return results;
}

export function groupAgentToolRequests(requests: readonly AgentToolRequest[]): readonly AgentToolRequestGroup[] {
  const groups: AgentToolRequestGroup[] = [];
  let readOnlyBatch: AgentToolRequest[] = [];

  for (const request of requests) {
    if (toolCanRunInReadOnlyBatch(request)) {
      readOnlyBatch.push(request);
      continue;
    }

    groups.push(...flushReadOnlyBatch(readOnlyBatch));
    readOnlyBatch = [];
    groups.push([request]);
  }

  groups.push(...flushReadOnlyBatch(readOnlyBatch));
  return groups;
}

function flushReadOnlyBatch(
  requests: readonly AgentToolRequest[],
): readonly AgentToolRequestGroup[] {
  return requests.length === 0 ? [] : [requests];
}

function toolCanRunInReadOnlyBatch(request: AgentToolRequest): boolean {
  switch (request.tool) {
    case "read":
    case "list":
    case "search":
    case "grep":
    case "glob":
    case "fetch":
    case "diff":
    case "stat":
    case "diagnostics":
      return true;
    case "research":
    case "mcp":
    case "shell":
    case "write":
    case "delete":
    case "mkdir":
    case "edit":
    case "patch":
    case "move":
    case "copy":
      return false;
    case "artifact":
      return request.action === "read" || request.action === "list";
    case "task":
      return request.action === "list";
    default:
      return assertNever(request);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected tool request: ${String(value)}`);
}
