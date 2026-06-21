import type { AgentToolName } from "./agent-tools.js";
import type { ChatMessage } from "./llm-provider.js";

export function isAgentToolName(value: string): value is AgentToolName {
  switch (value) {
    case "read":
    case "list":
    case "search":
    case "research":
    case "shell":
    case "write":
    case "edit":
    case "delete":
    case "mkdir":
    case "mcp":
      return true;
    default:
      return false;
  }
}

export function messageChars(messages: readonly ChatMessage[]): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

export function optionalSignal<T extends object>(input: T, signal: AbortSignal | undefined): T | T & { readonly signal: AbortSignal } {
  return signal === undefined ? input : { ...input, signal };
}
