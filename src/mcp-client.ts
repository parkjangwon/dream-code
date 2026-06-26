import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Buffer } from "node:buffer";

import { DREAM_VERSION } from "./constants.js";
import { loadMcpServers, type McpServer } from "./mcp-config.js";
import type { McpToolCall, McpToolSummary, ParsedMessage, PendingRequest, RpcResponse } from "./mcp-client-types.js";

export type { McpToolCall, McpToolSummary } from "./mcp-client-types.js";

const protocolVersion = "2024-11-05";
const defaultTimeoutMs = 10_000;

export async function listConfiguredMcpTools(root: string, signal?: AbortSignal): Promise<readonly McpToolSummary[]> {
  const servers = (await loadMcpServers(root)).filter((server) => server.enabled);
  const nested = await Promise.all(servers.map((server) => listServerTools(server, signal).catch(() => [])));
  return nested.flat();
}

export async function callConfiguredMcpTool(root: string, call: McpToolCall, signal?: AbortSignal): Promise<string> {
  const server = (await loadMcpServers(root)).find((candidate) => candidate.enabled && candidate.name === call.server);
  if (server === undefined) {
    throw new McpClientError(`MCP server not configured or disabled: ${call.server}`);
  }
  const session = new McpStdioSession(server, signal);
  try {
    await session.open();
    const result = await session.request("tools/call", {
      name: call.name,
      arguments: call.arguments ?? {},
    });
    return formatToolCallResult(result);
  } finally {
    session.close();
  }
}

export class McpClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpClientError";
  }
}

async function listServerTools(server: McpServer, signal: AbortSignal | undefined): Promise<readonly McpToolSummary[]> {
  const session = new McpStdioSession(server, signal);
  try {
    await session.open();
    const result = await session.request("tools/list", {});
    return toolsFromResult(server.name, result);
  } finally {
    session.close();
  }
}

class McpStdioSession {
  readonly #server: McpServer;
  readonly #signal: AbortSignal | undefined;
  #child: ChildProcessWithoutNullStreams | undefined;
  #buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  #nextId = 1;
  readonly #pending = new Map<number, PendingRequest>();

  constructor(server: McpServer, signal: AbortSignal | undefined) {
    this.#server = server;
    this.#signal = signal;
  }

  async open(): Promise<void> {
    if (this.#signal?.aborted === true) {
      throw new McpClientError("MCP request cancelled");
    }
    this.#child = spawn(this.#server.command, this.#server.args, { stdio: ["pipe", "pipe", "pipe"] });
    this.#child.stdout.on("data", (chunk: Buffer) => this.#read(chunk));
    this.#child.on("error", (error) => this.#rejectAll(error));
    this.#child.on("close", (code) => this.#rejectAll(new McpClientError(`MCP server exited with code ${code ?? 1}`)));
    this.#signal?.addEventListener("abort", () => this.close(), { once: true });
    await this.request("initialize", {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: "dream-code", version: DREAM_VERSION },
    });
    this.notify("notifications/initialized", {});
  }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const child = this.#child;
    if (child === undefined || child.killed) {
      return Promise.reject(new McpClientError("MCP server is not running"));
    }
    const id = this.#nextId;
    this.#nextId += 1;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new McpClientError(`MCP request timed out: ${method}`));
      }, defaultTimeoutMs);
      this.#pending.set(id, { resolve, reject, timeout });
      child.stdin.write(framePayload(payload));
    });
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.#child?.stdin.write(framePayload({ jsonrpc: "2.0", method, params }));
  }

  close(): void {
    this.#child?.kill("SIGTERM");
    this.#child = undefined;
  }

  #read(chunk: Buffer): void {
    try {
      this.#buffer = Buffer.concat([this.#buffer, chunk]);
      for (;;) {
        const parsed = takeMessage(this.#buffer);
        if (parsed === undefined) {
          return;
        }
        this.#buffer = parsed.rest;
        this.#handleMessage(parsed.message);
      }
    } catch (error) {
      this.#rejectAll(error instanceof Error ? error : new McpClientError("Invalid MCP message"));
      this.close();
    }
  }

  #handleMessage(message: unknown): void {
    if (!isRpcResponse(message)) {
      return;
    }
    const pending = this.#pending.get(message.id);
    if (pending === undefined) {
      return;
    }
    this.#pending.delete(message.id);
    clearTimeout(pending.timeout);
    if (message.error !== undefined) {
      pending.reject(new McpClientError(rpcErrorMessage(message.error)));
      return;
    }
    pending.resolve(message.result);
  }

  #rejectAll(error: Error): void {
    for (const [id, pending] of this.#pending) {
      this.#pending.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  }
}

function framePayload(payload: object): string {
  const body = JSON.stringify(payload);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

function takeMessage(buffer: Buffer<ArrayBufferLike>): ParsedMessage | undefined {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd < 0) {
    return undefined;
  }
  const header = buffer.subarray(0, headerEnd).toString("ascii");
  const length = contentLength(header);
  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + length;
  if (buffer.length < bodyEnd) {
    return undefined;
  }
  const message: unknown = JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString("utf8"));
  return {
    message,
    rest: buffer.subarray(bodyEnd),
  };
}

function contentLength(header: string): number {
  const match = /^Content-Length:\s*(\d+)$/imu.exec(header);
  if (match?.[1] === undefined) {
    throw new McpClientError("MCP message missing Content-Length");
  }
  return Number.parseInt(match[1], 10);
}

function toolsFromResult(server: string, result: unknown): readonly McpToolSummary[] {
  if (!isRecord(result) || !Array.isArray(result["tools"])) {
    return [];
  }
  return result["tools"].flatMap((tool) => {
    if (!isRecord(tool) || typeof tool["name"] !== "string") {
      return [];
    }
    return [{
      server,
      name: tool["name"],
      description: typeof tool["description"] === "string" ? tool["description"] : "",
    }];
  });
}

function formatToolCallResult(result: unknown): string {
  if (!isRecord(result)) {
    return JSON.stringify(result);
  }
  const prefix = result["isError"] === true ? "MCP tool returned an error:\n" : "";
  if (!Array.isArray(result["content"])) {
    return `${prefix}${JSON.stringify(result)}`;
  }
  return `${prefix}${result["content"].map(formatContentPart).join("\n")}`.trim();
}

function formatContentPart(part: unknown): string {
  if (!isRecord(part)) {
    return JSON.stringify(part);
  }
  if (part["type"] === "text" && typeof part["text"] === "string") {
    return part["text"];
  }
  return JSON.stringify(part);
}

function isRpcResponse(value: unknown): value is RpcResponse {
  return isRecord(value) && typeof value["id"] === "number";
}

function rpcErrorMessage(value: unknown): string {
  if (isRecord(value) && typeof value["message"] === "string") {
    return value["message"];
  }
  return "MCP server returned an error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
