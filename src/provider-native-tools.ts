import type { AgentToolName, AgentToolRequest } from "./agent-tool-schema.js";
import { toolRequestSchema } from "./agent-tool-schema.js";
import type { ProviderProtocol } from "./provider-registry.js";

type JsonSchema = Readonly<Record<string, unknown>>;

export type NativeToolDefinition = {
  readonly type: "function";
  readonly function: {
    readonly name: AgentToolName;
    readonly description: string;
    readonly parameters: JsonSchema;
  };
};

export type NativeResponseToolDefinition = {
  readonly type: "function";
  readonly name: AgentToolName;
  readonly description: string;
  readonly parameters: JsonSchema;
};

export type ProviderNativeToolDefinition = NativeToolDefinition | NativeResponseToolDefinition;

const toolDescriptions: Readonly<Record<AgentToolName, string>> = {
  read: "Read a workspace file.",
  list: "List workspace files.",
  search: "Search workspace text.",
  grep: "Search workspace text with ripgrep-style options.",
  glob: "Find workspace files by glob.",
  research: "Run configured web research.",
  fetch: "Fetch a URL.",
  diff: "Show workspace diff.",
  stat: "Show workspace path metadata.",
  diagnostics: "Run project diagnostics.",
  shell: "Run an allowlisted shell command.",
  write: "Write a workspace file.",
  edit: "Replace text in a workspace file.",
  patch: "Apply a unified patch.",
  delete: "Delete a workspace path.",
  mkdir: "Create a workspace directory.",
  move: "Move a workspace path.",
  copy: "Copy a workspace path.",
  artifact: "Read or write Dream artifacts.",
  task: "Read or update the task ledger.",
  mcp: "Call a configured MCP tool.",
};

const toolParameters: Readonly<Record<AgentToolName, JsonSchema>> = {
  read: objectSchema(["path"], { path: stringSchema(), startLine: integerSchema(), endLine: integerSchema() }),
  list: objectSchema([], { path: stringSchema() }),
  search: objectSchema(["query"], { query: stringSchema(), path: stringSchema() }),
  grep: objectSchema(["query"], { query: stringSchema(), path: stringSchema(), regex: booleanSchema(), glob: stringSchema(), caseSensitive: booleanSchema(), contextLines: integerSchema() }),
  glob: objectSchema(["pattern"], { pattern: stringSchema(), path: stringSchema(), maxResults: integerSchema() }),
  research: objectSchema(["query"], { query: stringSchema() }),
  fetch: objectSchema(["url"], { url: stringSchema(), maxChars: integerSchema() }),
  diff: objectSchema([], { path: stringSchema(), maxChars: integerSchema() }),
  stat: objectSchema(["path"], { path: stringSchema() }),
  diagnostics: objectSchema([], {}),
  shell: objectSchema(["command"], { command: stringSchema() }),
  write: objectSchema(["path", "content"], { path: stringSchema(), content: stringSchema() }),
  edit: objectSchema(["path", "search", "replace"], { path: stringSchema(), search: stringSchema(), replace: stringSchema(), replaceAll: booleanSchema(), expectedReplacements: integerSchema() }),
  patch: objectSchema(["patch"], { patch: stringSchema() }),
  delete: objectSchema(["path"], { path: stringSchema() }),
  mkdir: objectSchema(["path"], { path: stringSchema() }),
  move: objectSchema(["from", "to"], { from: stringSchema(), to: stringSchema(), overwrite: booleanSchema() }),
  copy: objectSchema(["from", "to"], { from: stringSchema(), to: stringSchema(), overwrite: booleanSchema() }),
  artifact: objectSchema(["action"], { action: enumSchema(["write", "read", "list", "delete"]), path: stringSchema(), name: stringSchema(), content: stringSchema() }),
  task: objectSchema(["action"], { action: enumSchema(["add", "update", "list"]), label: stringSchema(), detail: stringSchema(), id: stringSchema(), status: enumSchema(["todo", "doing", "done", "blocked"]) }),
  mcp: objectSchema(["server", "name"], { server: stringSchema(), name: stringSchema(), arguments: objectSchema([], {}) }),
};

export function nativeAgentToolDefinitions(names: readonly AgentToolName[]): readonly NativeToolDefinition[] {
  return names.map((name) => ({
    type: "function",
    function: {
      name,
      description: toolDescriptions[name],
      parameters: toolParameters[name],
    },
  }));
}

export function providerNativeToolDefinitions(
  protocol: ProviderProtocol,
  tools: readonly NativeToolDefinition[],
): readonly ProviderNativeToolDefinition[] {
  switch (protocol) {
    case "chat-completions":
      return tools;
    case "responses":
      return tools.map((tool) => ({
        type: "function",
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      }));
    default:
      return assertNever(protocol);
  }
}

export function parseNativeToolCall(name: string, rawArguments: string | undefined): AgentToolRequest | undefined {
  const parsedArguments = parseArguments(rawArguments);
  const parsed = toolRequestSchema.safeParse({ ...parsedArguments, tool: name });
  return parsed.success ? parsed.data : undefined;
}

function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (raw === undefined || raw.trim().length === 0) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {};
    }
    throw error;
  }
  return isRecord(parsed) ? parsed : {};
}

function objectSchema(required: readonly string[], properties: Readonly<Record<string, JsonSchema>>): JsonSchema {
  return { type: "object", additionalProperties: false, required, properties };
}

function stringSchema(): JsonSchema {
  return { type: "string" };
}

function integerSchema(): JsonSchema {
  return { type: "integer" };
}

function booleanSchema(): JsonSchema {
  return { type: "boolean" };
}

function enumSchema(values: readonly string[]): JsonSchema {
  return { type: "string", enum: values };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected provider tool protocol: ${String(value)}`);
}
