import type { ChatMessage, ProviderSettings } from "./llm-provider.js";
import type { ProviderProtocol } from "./provider-registry.js";
import { providerNativeToolDefinitions, type NativeToolDefinition } from "./provider-native-tools.js";

export function endpointFor(settings: ProviderSettings): string {
  switch (settings.protocol) {
    case "chat-completions":
      return `${settings.baseUrl}/chat/completions`;
    case "responses":
      return `${settings.baseUrl}/responses`;
    default:
      return assertNever(settings.protocol);
  }
}

export function buildProviderRequestHeaders(settings: ProviderSettings): Record<string, string> {
  const authHeader = settings.apiKeyHeader === "api-key"
    ? { "api-key": settings.apiKey }
    : { authorization: `Bearer ${settings.apiKey}` };
  return {
    ...settings.extraHeaders,
    ...authHeader,
    "content-type": "application/json",
  };
}

export function buildProviderRequestBody(
  protocol: ProviderProtocol,
  model: string,
  messages: readonly ChatMessage[],
  tools: readonly NativeToolDefinition[] = [],
): Readonly<Record<string, unknown>> {
  switch (protocol) {
    case "chat-completions":
      return withOptionalTools(protocol, { model, messages, stream: true }, tools);
    case "responses":
      return withOptionalTools(protocol, responseRequestBody(model, messages), tools);
    default:
      return assertNever(protocol);
  }
}

function withOptionalTools(
  protocol: ProviderProtocol,
  body: Readonly<Record<string, unknown>>,
  tools: readonly NativeToolDefinition[],
): Readonly<Record<string, unknown>> {
  return tools.length === 0 ? body : { ...body, tools: providerNativeToolDefinitions(protocol, tools) };
}

function responseRequestBody(
  model: string,
  messages: readonly ChatMessage[],
): Readonly<Record<string, unknown>> {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const input = messages.filter((message) => message.role !== "system");
  return instructions.length === 0
    ? { model, input: messages, store: false, stream: true }
    : { model, input, instructions, store: false, stream: true };
}

function assertNever(value: never): never {
  throw new Error(`Unexpected provider request variant: ${String(value)}`);
}
