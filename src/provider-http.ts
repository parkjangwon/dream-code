import { request } from "undici";

export type ProviderRequestOptions = NonNullable<Parameters<typeof request>[1]>;

type ProviderResponse = Awaited<ReturnType<typeof request>>;

const retryableStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const maxAttempts = 3;
const baseDelayMs = 100;
const maxRetryAfterMs = 5_000;

export async function requestProviderWithRetry(
  endpoint: string,
  options: ProviderRequestOptions,
): Promise<ProviderResponse> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await request(endpoint, options);
      if (!shouldRetryStatus(response.statusCode) || attempt === maxAttempts || requestAborted(options)) {
        return response;
      }
      await response.body.text();
      await delay(retryDelayMs(attempt, response.headers["retry-after"]));
    } catch (error) {
      if (attempt === maxAttempts || requestAborted(options) || !isRetryableRequestError(error)) {
        throw error;
      }
      await delay(retryDelayMs(attempt));
    }
  }
  return request(endpoint, options);
}

function shouldRetryStatus(statusCode: number): boolean {
  return retryableStatuses.has(statusCode);
}

function retryDelayMs(attempt: number, retryAfter?: string | readonly string[]): number {
  const parsedRetryAfter = parseRetryAfter(retryAfter);
  if (parsedRetryAfter !== undefined) {
    return parsedRetryAfter;
  }
  return baseDelayMs * 2 ** Math.max(0, attempt - 1);
}

function parseRetryAfter(value: string | readonly string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, maxRetryAfterMs);
  }
  const dateMs = Date.parse(raw);
  if (!Number.isFinite(dateMs)) {
    return undefined;
  }
  return Math.min(Math.max(0, dateMs - Date.now()), maxRetryAfterMs);
}

function isRetryableRequestError(error: unknown): boolean {
  return error instanceof Error
    && ["AbortError", "RequestAbortedError"].includes(error.name) === false;
}

function requestAborted(options: ProviderRequestOptions): boolean {
  const signal = options.signal;
  return signal instanceof AbortSignal && signal.aborted;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
