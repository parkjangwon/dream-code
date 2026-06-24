import type { AgentToolRequest } from "./agent-tool-schema.js";
import { runLspCheck } from "./lsp-check.js";
import { looksBlockedWebText, requestJinaReader, requestWebText } from "./web-retrieval.js";

type FetchRequest = Extract<AgentToolRequest, { readonly tool: "fetch" }>;

export async function runFetchTool(requestInput: FetchRequest, signal: AbortSignal | undefined): Promise<{ readonly ok: boolean; readonly output: string }> {
  const url = new URL(requestInput.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
  const response = await requestWebText(url, requestOptions(signal, 10_000));
  const textResult = response.ok && looksBlockedWebText(response)
    ? await requestJinaReader(requestInput.url, requestOptions(signal, 20_000))
    : response;
  const maxChars = requestInput.maxChars ?? 12_000;
  return {
    ok: textResult.ok,
    output: [
      `status ${textResult.statusCode}`,
      `content-type ${textResult.contentType}`,
      ...(textResult.source === requestInput.url ? [] : [`source ${textResult.source}`]),
      "",
      textResult.text.length > maxChars ? `${textResult.text.slice(0, maxChars)}\n[truncated]` : textResult.text,
    ].join("\n"),
  };
}

export async function runDiagnosticsTool(workspaceRoot: string): Promise<string> {
  return runLspCheck(workspaceRoot);
}

function requestOptions(signal: AbortSignal | undefined, timeoutMs: number): { readonly signal?: AbortSignal; readonly timeoutMs: number } {
  return {
    timeoutMs,
    ...(signal === undefined ? {} : { signal }),
  };
}
