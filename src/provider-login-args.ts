const nonRegionOptions = new Set([
  "api-key",
  "local",
  "no-auth",
  "none",
  "oauth",
  "subscription",
]);

export function baseUrlArgFromLoginParts(parts: readonly string[]): string | undefined {
  return parts.find(isHttpBaseUrl);
}

export function regionArgFromLoginParts(parts: readonly string[]): string | undefined {
  return parts.find((part) => !nonRegionOptions.has(part.toLowerCase()) && !isHttpBaseUrl(part));
}

function isHttpBaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && parsed.hostname.length > 0;
  } catch (error) {
    if (error instanceof TypeError) {
      return false;
    }
    throw error;
  }
}
