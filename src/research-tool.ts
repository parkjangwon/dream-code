import { runCapturedCommand } from "./shell-command.js";
import {
  looksBlockedWebText,
  requestJinaSearch,
  requestWebText,
} from "./web-retrieval.js";

export type ResearchResult = {
  readonly ok: boolean;
  readonly output: string;
};

export async function runResearch(query: string): Promise<ResearchResult> {
  const command = process.env["DREAM_RESEARCH_COMMAND"];
  if (command !== undefined && command.trim().length > 0) {
    return runResearchCommand(command, query);
  }
  return runSearchChain(query);
}

function runResearchCommand(command: string, query: string): Promise<ResearchResult> {
  return runCapturedCommand(command, {
    env: { ...process.env, DREAM_QUERY: query },
    timeoutMs: 15_000,
  });
}

async function runSearchChain(query: string): Promise<ResearchResult> {
  const duckDuckGo = await runDuckDuckGoSearch(query);
  if (duckDuckGo.ok) {
    return duckDuckGo;
  }
  const jina = await runJinaSearch(query);
  if (jina.ok) {
    return jina;
  }
  return {
    ok: false,
    output: [
      "No web research backend returned parseable results.",
      "",
      "DuckDuckGo:",
      duckDuckGo.output,
      "",
      "Jina Search:",
      jina.output,
      "",
      "Tip: set DREAM_RESEARCH_COMMAND for a paid/search-provider backend.",
    ].join("\n"),
  };
}

async function runDuckDuckGoSearch(query: string): Promise<ResearchResult> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = duckDuckGoSearchUrl(encodedQuery);
    const response = await requestWebText(url, { timeoutMs: 10_000 });
    const output = parseDuckDuckGoResults(response.text);
    if (response.ok && !looksBlockedWebText(response) && !noParsedResults(output)) {
      return { ok: true, output };
    }
    return { ok: false, output: looksBlockedWebText(response) ? "DuckDuckGo returned a bot/blocked page." : output };
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, output: error.message };
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

async function runJinaSearch(query: string): Promise<ResearchResult> {
  try {
    const response = await requestJinaSearch(query);
    const output = parseJinaSearchResults(response.text);
    return { ok: response.ok && !looksBlockedWebText(response) && !noParsedResults(output), output };
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, output: error.message };
    }
    throw error;
  }
}

export function parseJinaSearchResults(markdown: string): string {
  const linkedHeadings = [...markdown.matchAll(/^## \[(.*?)\]\((.*?)\)/gmu)];
  const sourceBlocks = [...markdown.matchAll(/^Title:\s*(.*?)\nURL Source:\s*(.*?)$/gmu)];
  const matches = linkedHeadings.length > 0
    ? linkedHeadings.map((match) => ({ title: match[1] ?? "result", url: match[2] ?? "" }))
    : sourceBlocks.map((match) => ({ title: match[1] ?? "result", url: match[2] ?? "" }));
  const results = matches
    .slice(0, 5)
    .map((match) => {
      const title = cleanHtml(match.title);
      const url = normalizeResultUrl(decodeHtml(match.url));
      return [`- ${title}`, `  ${url}`].join("\n");
    });
  return results.length === 0
    ? trimResearchText(markdown)
    : results.join("\n");
}

function noParsedResults(output: string): boolean {
  return output.startsWith("No web results parsed.");
}

function duckDuckGoSearchUrl(encodedQuery: string): string {
  const baseUrl = process.env["DREAM_DUCKDUCKGO_SEARCH_BASE_URL"] ?? "https://html.duckduckgo.com/html/";
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}q=${encodedQuery}`;
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

function trimResearchText(text: string): string {
  const trimmed = text.replace(/\r\n/gu, "\n").trim();
  return trimmed.length === 0
    ? "No web results parsed. Configure DREAM_RESEARCH_COMMAND for a custom search backend."
    : trimmed.slice(0, 6000);
}
