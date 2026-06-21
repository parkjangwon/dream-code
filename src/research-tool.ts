import { spawn } from "node:child_process";
import { request } from "undici";

export type ResearchResult = {
  readonly ok: boolean;
  readonly output: string;
};

const maxResearchOutput = 10_000;

export async function runResearch(query: string): Promise<ResearchResult> {
  const command = process.env["DREAM_RESEARCH_COMMAND"];
  if (command !== undefined && command.trim().length > 0) {
    return runResearchCommand(command, query);
  }
  return runDuckDuckGoSearch(query);
}

function runResearchCommand(command: string, query: string): Promise<ResearchResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      env: { ...process.env, DREAM_QUERY: query },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.on("error", (error) => resolve({ ok: false, output: error.message }));
    child.on("close", (code) => resolve({ ok: code === 0, output: output.trim() }));
  });
}

async function runDuckDuckGoSearch(query: string): Promise<ResearchResult> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
    const response = await request(url, {
      method: "GET",
      headers: { "user-agent": "Mozilla/5.0" },
      bodyTimeout: 10_000,
      headersTimeout: 10_000,
    });
    const html = await response.body.text();
    const output = parseDuckDuckGoResults(html);
    if (response.statusCode >= 200 && response.statusCode < 300 && !noParsedResults(output)) {
      return { ok: true, output };
    }
    return runJinaDuckDuckGoSearch(encodedQuery);
  } catch (error) {
    if (error instanceof Error) {
      const fallback = await runJinaDuckDuckGoSearch(encodeURIComponent(query));
      return fallback.ok ? fallback : { ok: false, output: error.message };
    }
    throw error;
  }
}

export function parseDuckDuckGoResults(html: string): string {
  const results = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gu)]
    .slice(0, 5)
    .map((match) => {
      const rawUrl = decodeHtml(match[1] ?? "");
      const snippet = snippetAfter(html, match.index ?? 0);
      return [
        `- ${cleanHtml(match[2] ?? "result")}`,
        `  ${normalizeResultUrl(rawUrl)}`,
        ...(snippet.length === 0 ? [] : [`  ${snippet}`]),
      ].join("\n");
    });
  return results.length === 0
    ? "No web results parsed. Configure DREAM_RESEARCH_COMMAND for a custom search backend."
    : results.join("\n");
}

async function runJinaDuckDuckGoSearch(encodedQuery: string): Promise<ResearchResult> {
  try {
    const target = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
    const response = await request(`https://r.jina.ai/http://r.jina.ai/http://${target}`, {
      method: "GET",
      headers: { "user-agent": "Mozilla/5.0" },
      bodyTimeout: 15_000,
      headersTimeout: 15_000,
    });
    const markdown = await response.body.text();
    const output = parseJinaSearchResults(markdown);
    return { ok: response.statusCode >= 200 && response.statusCode < 300 && !noParsedResults(output), output };
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, output: error.message };
    }
    throw error;
  }
}

export function parseJinaSearchResults(markdown: string): string {
  const results = [...markdown.matchAll(/^## \[(.*?)\]\((.*?)\)/gmu)]
    .slice(0, 5)
    .map((match) => {
      const title = cleanHtml(match[1] ?? "result");
      const url = normalizeResultUrl(decodeHtml(match[2] ?? ""));
      return [`- ${title}`, `  ${url}`].join("\n");
    });
  return results.length === 0
    ? "No web results parsed. Configure DREAM_RESEARCH_COMMAND for a custom search backend."
    : results.join("\n");
}

function noParsedResults(output: string): boolean {
  return output.startsWith("No web results parsed.");
}

function cleanHtml(text: string): string {
  return decodeHtml(text.replace(/<[^>]+>/gu, "").replace(/\s+/gu, " ").trim());
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;/gu, "'");
}

function normalizeResultUrl(rawUrl: string): string {
  const withProtocol = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
  try {
    const url = new URL(withProtocol);
    const redirected = url.searchParams.get("uddg");
    return redirected === null ? withProtocol : redirected;
  } catch (error) {
    if (error instanceof TypeError) {
      return withProtocol;
    }
    throw error;
  }
}

function snippetAfter(html: string, index: number): string {
  const nearby = html.slice(index, index + 1500);
  const match = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/u.exec(nearby)
    ?? /class="result__snippet"[^>]*>([\s\S]*?)<\/div>/u.exec(nearby);
  return cleanHtml(match?.[1] ?? "");
}

function appendLimited(base: string, chunk: string): string {
  const next = `${base}${chunk}`;
  return next.length > maxResearchOutput ? `${next.slice(0, maxResearchOutput)}\n[truncated]` : next;
}
