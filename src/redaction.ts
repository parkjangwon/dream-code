const bearerTokenPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/giu;
const apiKeyAssignmentPattern = /\b([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET))=([^\s"']+)/giu;
const standaloneApiKeyPattern = /\bsk-(?:live|proj|test)-[A-Za-z0-9_-]{16,}\b/gu;
const querySecretPattern = /([?&](?:access_token|api_key|key|secret|token)=)[^&\s"']+/giu;

export function redactSecrets(text: string): string {
  return text
    .replace(bearerTokenPattern, "Bearer [redacted:bearer-token]")
    .replace(apiKeyAssignmentPattern, "$1=[redacted:api-key]")
    .replace(standaloneApiKeyPattern, "[redacted:api-key]")
    .replace(querySecretPattern, "$1[redacted:query-secret]");
}

export function redactJsonSecrets<T>(value: T): T {
  if (typeof value === "string") {
    return redactSecrets(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactJsonSecrets(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactJsonSecrets(entry)]),
    ) as T;
  }
  return value;
}
