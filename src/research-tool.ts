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
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await request(url, {
      method: "GET",
      headers: { "user-agent": "Dream Code research" },
      bodyTimeout: 10_000,
      headersTimeout: 10_000,
    });
    const html = await response.body.text();
    return { ok: response.statusCode >= 200 && response.statusCode < 300, output: parseDuckDuckGoResults(html) };
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, output: error.message };
    }
    throw error;
  }
}

function parseDuckDuckGoResults(html: string): string {
  const results = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gu)]
    .slice(0, 5)
    .map((match) => `- ${cleanHtml(match[2] ?? "result")}\n  ${decodeHtml(match[1] ?? "")}`);
  return results.length === 0 ? "No web results parsed." : results.join("\n");
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

function appendLimited(base: string, chunk: string): string {
  const next = `${base}${chunk}`;
  return next.length > maxResearchOutput ? `${next.slice(0, maxResearchOutput)}\n[truncated]` : next;
}
