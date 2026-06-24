import type { AgentToolRequest } from "./agent-tool-schema.js";
import { toolLabel } from "./agent-tool-labels.js";

export function formatPermissionPreview(request: AgentToolRequest): string {
  return [
    `preview: ${previewLine(request)}`,
    ...detailLines(request),
    `risk: ${riskLine(request)}`,
    "next: approve this tool, switch to yolo, or ask Dream Code for a non-mutating plan.",
  ].join("\n");
}

function previewLine(request: AgentToolRequest): string {
  switch (request.tool) {
    case "write":
      return `write ${request.path} (${request.content.length} chars)`;
    case "edit":
      return `edit ${request.path} (${request.replaceAll === true ? "all matches" : "first match"})`;
    case "delete":
      return `delete ${request.path}`;
    case "mkdir":
      return `create directory ${request.path}`;
    case "move":
      return `move ${request.from} -> ${request.to}`;
    case "copy":
      return `copy ${request.from} -> ${request.to}`;
    case "patch":
      return `apply patch (${request.patch.length} chars)`;
    case "artifact":
      return `${request.action} artifact ${request.path ?? request.name ?? "(unnamed)"}`;
    case "task":
      return `${request.action} task ${request.id ?? request.label ?? "(unspecified)"}`;
    case "shell":
    case "mcp":
      return toolLabel(request);
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
      return toolLabel(request);
    default:
      return assertNever(request);
  }
}

function detailLines(request: AgentToolRequest): readonly string[] {
  switch (request.tool) {
    case "write":
      return [`target: workspace file`, `path: ${request.path}`, `content: ${bounded(request.content)}`];
    case "edit":
      return [`target: workspace file`, `path: ${request.path}`, `old: ${bounded(request.search)}`, `new: ${bounded(request.replace)}`];
    case "patch":
      return [`target: workspace patch`, bounded(request.patch)];
    case "delete":
    case "mkdir":
      return [`target: workspace file`, `path: ${request.path}`];
    case "move":
    case "copy":
      return [`target: workspace file`, `from: ${request.from}`, `to: ${request.to}`];
    case "shell":
      return ["target: shell", `command: ${request.command}`];
    case "mcp":
      return ["target: mcp", `server: ${request.server}`, `tool: ${request.name}`];
    case "artifact":
      return ["target: saved artifact"];
    case "task":
      return ["target: task ledger"];
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
      return [];
    default:
      return assertNever(request);
  }
}

function bounded(value: string): string {
  const singleLine = value.replace(/\s+/gu, " ").trim();
  return singleLine.length <= 160 ? singleLine : `${singleLine.slice(0, 157)}...`;
}

function riskLine(request: AgentToolRequest): string {
  switch (request.tool) {
    case "write":
    case "edit":
    case "delete":
    case "mkdir":
    case "move":
    case "copy":
    case "patch":
      return "mutates workspace";
    case "shell":
      return "external command can install packages or change machine state";
    case "mcp":
      return "external MCP tool may change provider or saved state";
    case "artifact":
    case "task":
      return "changes saved agent state";
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
      return "read-only";
    default:
      return assertNever(request);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected tool request: ${String(value)}`);
}
