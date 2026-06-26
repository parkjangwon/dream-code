import type { IncomingMessage, ServerResponse } from "node:http";

import type { RemoteCommandBroker } from "./remote-command-broker.js";

export async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim().length === 0 ? {} : JSON.parse(raw);
}

export function bearerToken(header: string | readonly string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith("Bearer ") === true ? value.slice("Bearer ".length) : undefined;
}

export const remoteTokenCookieName = "dream_remote_token";

export function cookieToken(header: string | readonly string[] | undefined): string | undefined {
  const value = typeof header === "string" ? header : header?.join("; ");
  if (value === undefined) {
    return undefined;
  }
  for (const pair of value.split(";")) {
    const [name, ...rawValue] = pair.trim().split("=");
    if (name === remoteTokenCookieName) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return undefined;
}

export function remoteAuthCookie(token: string): string {
  return `${remoteTokenCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7776000`;
}

export function clearRemoteAuthCookie(): string {
  return `${remoteTokenCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

export function sendJson(response: ServerResponse, status: number, body: unknown, headers: Record<string, string | readonly string[]> = {}): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(`${JSON.stringify(body)}\n`);
}

export function sendSse(request: IncomingMessage, response: ServerResponse, broker: RemoteCommandBroker): void {
  response.writeHead(200, {
    "cache-control": "no-cache",
    "connection": "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
  });
  const unsubscribe = broker.subscribe((event) => {
    response.write(`event: ${event.type}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  request.once("close", unsubscribe);
}
