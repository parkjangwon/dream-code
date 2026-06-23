import { request } from "undici";

import type { AgentToolRequest } from "./agent-tool-schema.js";
import { runLspCheck } from "./lsp-check.js";

type FetchRequest = Extract<AgentToolRequest, { readonly tool: "fetch" }>;

export async function runFetchTool(requestInput: FetchRequest, signal: AbortSignal | undefined): Promise<{ readonly ok: boolean; readonly output: string }> {
  const url = new URL(requestInput.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
  const response = await request(url, {
    method: "GET",
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
    ...(signal === undefined ? {} : { signal }),
  });
  const text = await response.body.text();
  const maxChars = requestInput.maxChars ?? 12_000;
  return {
    ok: response.statusCode >= 200 && response.statusCode < 400,
    output: [
      `status ${response.statusCode}`,
      `content-type ${headerText(response.headers["content-type"]) ?? "unknown"}`,
      "",
      text.length > maxChars ? `${text.slice(0, maxChars)}\n[truncated]` : text,
    ].join("\n"),
  };
}

export async function runDiagnosticsTool(workspaceRoot: string): Promise<string> {
  return runLspCheck(workspaceRoot);
}

function headerText(value: string | string[] | readonly string[] | undefined): string | undefined {
  if (typeof value === "string" || value === undefined) {
    return value;
  }
  return [...value].join(", ");
}
