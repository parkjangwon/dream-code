import { z } from "zod";

import { toolRequestSchema, type AgentToolRequest } from "./agent-tool-schema.js";

const toolRequestEnvelopeSchema = z.union([
  toolRequestSchema,
  z.array(toolRequestSchema),
  z.object({ tool_calls: z.array(toolRequestSchema) }),
  z.object({ calls: z.array(toolRequestSchema) }),
]);

export function extractAgentToolRequests(text: string): readonly AgentToolRequest[] {
  const fenced = [...text.matchAll(/```dream-tool\s*\n([\s\S]*?)```/gu)]
    .flatMap((match) => parseToolLines(match[1] ?? ""))
    .slice(0, 12);
  return fenced.length > 0 ? fenced : parseBareToolObjects(text).slice(0, 12);
}

function parseToolLines(raw: string): readonly AgentToolRequest[] {
  return raw.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0).flatMap(parseToolLine);
}

function parseToolLine(line: string): readonly AgentToolRequest[] {
  try {
    return parseToolJson(line);
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }
}

function parseBareToolObjects(text: string): readonly AgentToolRequest[] {
  if (!/["']tool["']\s*:/u.test(text)) {
    return [];
  }
  return [...text.matchAll(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gu)]
    .flatMap((match) => parseToolJson(match[0] ?? ""));
}

function parseToolJson(raw: string): readonly AgentToolRequest[] {
  const parsedJson = parseJsonObject(raw) ?? parseJsonObject(normalizeLooseJson(raw));
  const parsed = toolRequestEnvelopeSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return [];
  }
  if (Array.isArray(parsed.data)) {
    return parsed.data;
  }
  if ("tool_calls" in parsed.data) {
    return parsed.data.tool_calls;
  }
  if ("calls" in parsed.data) {
    return parsed.data.calls;
  }
  return [parsed.data];
}

function parseJsonObject(raw: string | undefined): unknown {
  if (raw === undefined) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed;
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

function normalizeLooseJson(raw: string): string {
  return raw.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/gu, (_match, value: string) => {
    return JSON.stringify(value.replace(/\\'/gu, "'"));
  });
}
