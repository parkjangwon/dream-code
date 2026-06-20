import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { ansi, paint } from "./ansi.js";

const mcpServerSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  enabled: z.boolean(),
});

export type McpServer = z.infer<typeof mcpServerSchema>;

export class McpConfigParseError extends Error {
  readonly filePath: string;

  constructor(filePath: string, reason: string) {
    super(`Could not parse Dream Code MCP config at ${filePath}: ${reason}`);
    this.name = "McpConfigParseError";
    this.filePath = filePath;
  }
}

export function mcpConfigFilePath(root: string): string {
  return join(root, "mcp.toml");
}

export async function loadMcpServers(root: string): Promise<readonly McpServer[]> {
  const raw = await readOptional(mcpConfigFilePath(root));
  return raw === undefined ? [] : parseMcpServers(raw, mcpConfigFilePath(root));
}

export async function formatMcpStatus(root: string): Promise<string> {
  const servers = await loadMcpServers(root);
  return [
    paint("MCP", `${ansi.bold}${ansi.accent}`),
    `${paint("config", ansi.muted)} ${paint(mcpConfigFilePath(root), ansi.blue)}`,
    ...(servers.length === 0
      ? [paint("No MCP servers configured.", ansi.dim)]
      : servers.map((server) => `${paint(server.enabled ? "on " : "off", server.enabled ? ansi.green : ansi.muted)} ${server.name.padEnd(16)} ${server.command} ${server.args.join(" ")}`)),
  ].join("\n");
}

export async function formatMcpServersForPrompt(root: string): Promise<string> {
  const servers = (await loadMcpServers(root)).filter((server) => server.enabled);
  if (servers.length === 0) {
    return "MCP servers: none configured.";
  }
  return [
    "MCP servers configured:",
    ...servers.map((server) => `- ${server.name}: ${server.command} ${server.args.join(" ")}`.trim()),
  ].join("\n");
}

function parseMcpServers(raw: string, filePath: string): readonly McpServer[] {
  return raw.split(/\[\[server\]\]/u).slice(1).map((block) => parseServerBlock(block, filePath));
}

function parseServerBlock(block: string, filePath: string): McpServer {
  const values = new Map(block.split(/\r?\n/u).flatMap(parseKeyValueLine));
  const parsed = mcpServerSchema.safeParse({
    name: unquote(values.get("name") ?? ""),
    command: unquote(values.get("command") ?? ""),
    args: parseArray(values.get("args") ?? "[]"),
    enabled: values.get("enabled") !== "false",
  });
  if (!parsed.success) {
    throw new McpConfigParseError(filePath, parsed.error.message);
  }
  return parsed.data;
}

function parseKeyValueLine(line: string): readonly [string, string][] {
  const match = /^\s*([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+?)\s*$/u.exec(line);
  if (match?.[1] === undefined || match[2] === undefined) {
    return [];
  }
  return [[match[1], match[2].trim()]];
}

function parseArray(value: string): readonly string[] {
  return [...value.matchAll(/"((?:\\"|[^"])*)"/gu)].map((match) => (match[1] ?? "").replace(/\\"/gu, "\""));
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("\"") && trimmed.endsWith("\"") ? trimmed.slice(1, -1) : trimmed;
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

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
