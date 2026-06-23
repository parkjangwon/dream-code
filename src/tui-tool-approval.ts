import type { AgentToolRequest } from "./agent-tools.js";
import type { Questioner } from "./tui-workspace-commands.js";

export async function approveAgentTool(request: AgentToolRequest, questioner: Questioner): Promise<boolean> {
  const answer = await questioner.question(`${approvalLabel(request)}? [y/N] `);
  const normalized = answer.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}

function approvalLabel(request: AgentToolRequest): string {
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
    case "shell":
      return `run shell: ${request.command}`;
    case "write":
      return `write ${request.path}`;
    case "edit":
      return `edit ${request.path}`;
    case "delete":
      return `delete ${request.path}`;
    case "mkdir":
      return `create directory ${request.path}`;
    case "mcp":
      return `call MCP ${request.server}/${request.name}`;
    default:
      return assertNever(request);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected tool request: ${String(value)}`);
}
