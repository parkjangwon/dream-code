import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import { type DreamConfig, saveConfig } from "./config.js";
import { CodexOAuthError, codexOAuthBaseUrl, readCodexOAuthCredential } from "./codex-oauth.js";
import { writeProviderCredential } from "./credentials.js";
import type { ProviderEnv } from "./llm-provider.js";
import type { ProviderDefinition } from "./provider-registry.js";

export type ConnectOpenAiOauthOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly env?: ProviderEnv | undefined;
  readonly definition: ProviderDefinition;
};

export async function connectOpenAiOauth(
  options: ConnectOpenAiOauthOptions,
): Promise<DreamConfig> {
  try {
    const oauthCredential = await readCodexOAuthCredential(options.env);
    await writeProviderCredential(options.configRoot, options.definition.id, {
      authMode: "oauth",
      region: "chatgpt",
      baseUrl: codexOAuthBaseUrl,
      accountId: oauthCredential.accountId,
    });
    const nextConfig = configWithProvider(options.config, options.definition);
    await saveConfig(options.configRoot, nextConfig);
    output.write(`connected ${options.definition.displayName} (${paint("ChatGPT OAuth", ansi.green)})\n`);
    return nextConfig;
  } catch (error) {
    if (error instanceof CodexOAuthError) {
      output.write(`${error.message}\n`);
      return options.config;
    }
    throw error;
  }
}

function configWithProvider(config: DreamConfig, definition: ProviderDefinition): DreamConfig {
  return {
    ...config,
    model: {
      ...config.model,
      mode: "single",
      single: {
        provider: definition.id,
        models: { ...definition.defaultModels },
        defaultTier: "mid",
      },
    },
  };
}
