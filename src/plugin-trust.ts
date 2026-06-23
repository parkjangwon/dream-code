import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { PluginRecord } from "./plugin-registry.js";
import { formatCommandPreview } from "./trust-summary.js";

export async function summarizePluginTrust(sourceRoot: string): Promise<PluginRecord["trust"]> {
  const raw = await readOptional(join(sourceRoot, ".mcp.json"));
  if (raw === undefined) {
    return { commandSurfaces: 0, mcpCommands: [] };
  }
  const parsed = parseJsonObject(raw);
  const servers = isRecord(parsed) && isRecord(parsed["mcpServers"])
    ? Object.values(parsed["mcpServers"])
    : [];
  const mcpCommands = servers.flatMap((server) => {
    if (!isRecord(server) || typeof server["command"] !== "string") {
      return [];
    }
    const args = Array.isArray(server["args"])
      ? server["args"].filter((arg): arg is string => typeof arg === "string")
      : [];
    return [formatCommandPreview(server["command"], args)];
  });
  return { commandSurfaces: 0, mcpCommands };
}

function parseJsonObject(raw: string): unknown {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
