import { z } from "zod";

import { parseNativeToolCall } from "./provider-native-tools.js";
import type { ProviderProtocol } from "./provider-registry.js";

export type StreamDataEvent =
  | { readonly kind: "content"; readonly content: string }
  | { readonly kind: "tool_call"; readonly request: import("./agent-tool-schema.js").AgentToolRequest }
  | { readonly kind: "done" }
  | { readonly kind: "skip" };

const chatChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({
      content: z.string().nullable().optional(),
      tool_calls: z.array(z.object({
        function: z.object({
          name: z.string().optional(),
          arguments: z.string().optional(),
        }).passthrough().optional(),
      }).passthrough()).optional(),
    }).passthrough(),
  }).passthrough()),
}).passthrough();

const responsesChunkSchema = z.object({
  type: z.string().optional(),
  delta: z.string().optional(),
  item: z.object({
    type: z.string().optional(),
    name: z.string().optional(),
    arguments: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

export class ProviderProtocolError extends Error {
  constructor(reason: string) {
    super(`Provider stream protocol error: ${reason}`);
    this.name = "ProviderProtocolError";
  }
}

export async function* streamEventsFromChunks(
  chunks: AsyncIterable<unknown>,
  protocol: ProviderProtocol = "chat-completions",
): AsyncGenerator<StreamDataEvent> {
  let buffer = "";

  for await (const chunk of chunks) {
    buffer += chunkToText(chunk);
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      yield parseStreamLine(line, protocol);
    }
  }

  if (buffer.trim().length > 0) {
    yield parseStreamLine(buffer, protocol);
  }
}

export function parseStreamLine(line: string, protocol: ProviderProtocol): StreamDataEvent {
  switch (protocol) {
    case "chat-completions":
      return parseOpenAiStreamLine(line);
    case "responses":
      return parseOpenAiResponsesLine(line);
    default:
      return assertNever(protocol);
  }
}

export function parseOpenAiStreamLine(line: string): StreamDataEvent {
  const data = parseSseData(line);
  if (data.kind !== "json") {
    return data.event;
  }

  const parsedChunk = chatChunkSchema.safeParse(data.value);
  if (!parsedChunk.success) {
    throw new ProviderProtocolError(parsedChunk.error.message);
  }

  const delta = parsedChunk.data.choices[0]?.delta;
  const nativeCall = firstNativeToolCall(delta?.tool_calls);
  if (nativeCall !== undefined) {
    return nativeCall;
  }
  const content = delta?.content;
  return content === undefined || content === null || content.length === 0
    ? { kind: "skip" }
    : { kind: "content", content };
}

export function parseOpenAiResponsesLine(line: string): StreamDataEvent {
  const data = parseSseData(line);
  if (data.kind !== "json") {
    return data.event;
  }

  const parsedChunk = responsesChunkSchema.safeParse(data.value);
  if (!parsedChunk.success) {
    throw new ProviderProtocolError(parsedChunk.error.message);
  }

  if (parsedChunk.data.type === "response.completed") {
    return { kind: "done" };
  }
  if (parsedChunk.data.type === "response.output_text.delta") {
    const delta = parsedChunk.data.delta;
    return delta === undefined || delta.length === 0
      ? { kind: "skip" }
      : { kind: "content", content: delta };
  }
  if (parsedChunk.data.type === "response.output_item.done" && parsedChunk.data.item?.type === "function_call") {
    const request = parsedChunk.data.item.name === undefined
      ? undefined
      : parseNativeToolCall(parsedChunk.data.item.name, parsedChunk.data.item.arguments);
    return request === undefined ? { kind: "skip" } : { kind: "tool_call", request };
  }
  return { kind: "skip" };
}

function firstNativeToolCall(calls: readonly unknown[] | undefined): StreamDataEvent | undefined {
  const call = calls?.map(readNativeCall).find((candidate) => candidate.name !== undefined);
  const name = call?.name;
  if (name === undefined) {
    return undefined;
  }
  const request = parseNativeToolCall(name, call?.arguments);
  return request === undefined ? undefined : { kind: "tool_call", request };
}

function readNativeCall(value: unknown): { readonly name?: string; readonly arguments?: string } {
  if (!isRecord(value)) {
    return {};
  }
  const fn = value["function"];
  if (!isRecord(fn)) {
    return {};
  }
  return {
    ...(typeof fn["name"] === "string" ? { name: fn["name"] } : {}),
    ...(typeof fn["arguments"] === "string" ? { arguments: fn["arguments"] } : {}),
  };
}

function parseSseData(
  line: string,
): { readonly kind: "json"; readonly value: unknown } | { readonly kind: "event"; readonly event: StreamDataEvent } {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return { kind: "event", event: { kind: "skip" } };
  }

  const data = trimmed.slice("data:".length).trim();
  if (data === "[DONE]") {
    return { kind: "event", event: { kind: "done" } };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(data);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ProviderProtocolError(error.message);
    }
    throw error;
  }
  return { kind: "json", value: parsedJson };
}

function chunkToText(chunk: unknown): string {
  if (typeof chunk === "string") {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString("utf8");
  }
  throw new ProviderProtocolError(`unexpected stream chunk type: ${typeof chunk}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertNever(value: never): never {
  throw new ProviderProtocolError(`unexpected provider protocol: ${String(value)}`);
}
