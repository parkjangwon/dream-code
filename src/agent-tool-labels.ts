import type { AgentToolRequest } from "./agent-tool-schema.js";

export function toolLabel(request: AgentToolRequest): string {
  switch (request.tool) {
    case "read":
      return `read ${request.path}`;
    case "list":
      return `list ${request.path ?? "."}`;
    case "search":
      return `search ${request.query}`;
    case "research":
      return `research ${request.query}`;
    case "shell":
      return `shell ${request.command}`;
    case "write":
      return `write ${request.path}`;
    case "delete":
      return `delete ${request.path}`;
    case "mkdir":
      return `mkdir ${request.path}`;
    case "edit":
      return `edit ${request.path}`;
    case "mcp":
      return `mcp ${request.server}/${request.name}`;
    default:
      return assertNever(request);
  }
}

export function toolResultLabel(request: AgentToolRequest): string {
  return request.id === undefined ? toolLabel(request) : `${request.id} ${toolLabel(request)}`;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected tool request: ${String(value)}`);
}
