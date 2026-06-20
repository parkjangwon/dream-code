import { z } from "zod";

import type { ProviderProtocol } from "./provider-registry.js";

export type StreamDataEvent =
  | { readonly kind: "content"; readonly content: string }
  | { readonly kind: "done" }
  | { readonly kind: "skip" };

const chatChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({
      content: z.string().nullable().optional(),
    }).passthrough(),
  }).passthrough()),
}).passthrough();

const responsesChunkSchema = z.object({
  type: z.string().optional(),
  delta: z.string().optional(),
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

  const content = parsedChunk.data.choices[0]?.delta.content;
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
  return { kind: "skip" };
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

function assertNever(value: never): never {
  throw new ProviderProtocolError(`unexpected provider protocol: ${String(value)}`);
}
