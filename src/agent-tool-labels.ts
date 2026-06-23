import type { AgentToolRequest } from "./agent-tool-schema.js";

export function toolLabel(request: AgentToolRequest): string {
  switch (request.tool) {
    case "read":
      return `read ${request.path}`;
    case "list":
      return `list ${request.path ?? "."}`;
    case "search":
      return `search ${request.query}`;
    case "grep":
      return `grep ${request.query}`;
    case "glob":
      return `glob ${request.pattern}`;
    case "research":
      return `research ${request.query}`;
    case "fetch":
      return `fetch ${request.url}`;
    case "diff":
      return `diff ${request.path ?? "."}`;
    case "stat":
      return `stat ${request.path}`;
    case "diagnostics":
      return "diagnostics";
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
    case "patch":
      return "patch";
    case "move":
      return `move ${request.from} -> ${request.to}`;
    case "copy":
      return `copy ${request.from} -> ${request.to}`;
    case "artifact":
      return `artifact ${request.action}${artifactPath(request) === undefined ? "" : ` ${artifactPath(request)}`}`;
    case "task":
      return `task ${request.action}${request.id === undefined ? "" : ` ${request.id}`}`;
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

function artifactPath(request: Extract<AgentToolRequest, { readonly tool: "artifact" }>): string | undefined {
  return request.path ?? request.name;
}
