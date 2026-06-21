import type { ProviderCredential } from "./credentials.js";

export const openAiCodexOAuthModels = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex-spark",
] as const;

export function modelAvailableForCredential(
  provider: string,
  model: string,
  credential: ProviderCredential | undefined,
): boolean {
  if (provider !== "openai" || credential?.authMode !== "oauth") {
    return true;
  }
  return openAiCodexOAuthModels.some((allowed) => allowed === model);
}
