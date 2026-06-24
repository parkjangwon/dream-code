import { request } from "undici";

export type WebTextResult = {
  readonly ok: boolean;
  readonly statusCode: number;
  readonly contentType: string;
  readonly text: string;
  readonly source: string;
};

type RequestOptions = {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
};

const defaultTimeoutMs = 12_000;

export async function requestWebText(url: string | URL, options: RequestOptions = {}): Promise<WebTextResult> {
  const response = await request(url, {
    method: "GET",
    headers: webHeaders(),
    headersTimeout: options.timeoutMs ?? defaultTimeoutMs,
    bodyTimeout: options.timeoutMs ?? defaultTimeoutMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const text = await response.body.text();
  return {
    ok: response.statusCode >= 200 && response.statusCode < 400,
    statusCode: response.statusCode,
    contentType: headerText(response.headers["content-type"]) ?? "unknown",
    text,
    source: String(url),
  };
}

export async function requestJinaReader(targetUrl: string, options: RequestOptions = {}): Promise<WebTextResult> {
  return requestWebText(jinaReaderUrl(targetUrl), options);
}

export async function requestJinaSearch(query: string, options: RequestOptions = {}): Promise<WebTextResult> {
  return requestWebText(jinaSearchUrl(query), { ...options, timeoutMs: options.timeoutMs ?? 20_000 });
}

export function jinaReaderUrl(targetUrl: string): string {
  return `${envBaseUrl("DREAM_JINA_READER_BASE_URL", "https://r.jina.ai").replace(/\/+$/u, "")}/${targetUrl}`;
}

export function jinaSearchUrl(query: string): string {
  return `${envBaseUrl("DREAM_JINA_SEARCH_BASE_URL", "https://s.jina.ai").replace(/\/+$/u, "")}/${encodeURIComponent(query)}`;
}

export function looksBlockedWebText(result: Pick<WebTextResult, "statusCode" | "text">): boolean {
  if ([401, 403, 407, 429, 503].includes(result.statusCode)) {
    return true;
  }
  const normalized = result.text.toLowerCase().replace(/\s+/gu, " ");
  return [
    "captcha",
    "unusual traffic",
    "verify you are human",
    "enable javascript",
    "access denied",
    "bot detection",
    "automated access",
    "our systems have detected",
    "too many requests",
    "\uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4",
    "\uc790\ub3d9 \uc811\uadfc",
    "\ube44\uc815\uc0c1\uc801\uc778 \ud2b8\ub798\ud53d",
  ].some((needle) => normalized.includes(needle));
}

export function webHeaders(): Record<string, string> {
  return {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "user-agent": "DreamCode/0.1 (+https://github.com/parkjangwon/dream-code) Mozilla/5.0",
    ...jinaAuthHeader(),
  };
}

function jinaAuthHeader(): Record<string, string> {
  const token = process.env["DREAM_JINA_API_KEY"] ?? process.env["JINA_API_KEY"];
  return token === undefined || token.trim().length === 0
    ? {}
    : { authorization: `Bearer ${token}` };
}

function envBaseUrl(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim().length === 0 ? fallback : value;
}

function headerText(value: string | string[] | readonly string[] | undefined): string | undefined {
  if (typeof value === "string" || value === undefined) {
    return value;
  }
  return [...value].join(", ");
}
