import { request } from "undici";

import { CodexOAuthError, readCodexOAuthCredential } from "./codex-oauth.js";
import { readProviderCredential, type ProviderCredential } from "./credentials.js";
import type { SelectedModel } from "./model-routing.js";
import {
  apiKeyEnvKeys,
  baseUrlEnvKeys,
  providerModelIdForRequest,
  regionForProvider,
  resolveProviderDefinition,
  type ApiKeyHeader,
  type ProviderProtocol,
} from "./provider-registry.js";
import {
  parseOpenAiResponsesLine,
  parseOpenAiStreamLine,
  ProviderProtocolError,
  streamEventsFromChunks,
  type StreamDataEvent,
} from "./llm-stream-parser.js";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  readonly role: ChatRole;
  readonly content: string;
};

export type ProviderSettings = {
  readonly provider: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly apiKeyHeader: ApiKeyHeader;
  readonly protocol: ProviderProtocol;
  readonly extraHeaders: Readonly<Record<string, string>>;
};

export type ProviderEnv = Readonly<Record<string, string | undefined>>;

export type StreamChatInput = {
  readonly selectedModel: SelectedModel;
  readonly messages: readonly ChatMessage[];
  readonly env?: ProviderEnv;
  readonly configRoot?: string;
  readonly onToken: (token: string) => void | Promise<void>;
};

export { parseOpenAiResponsesLine, parseOpenAiStreamLine, ProviderProtocolError, streamEventsFromChunks };
export type { StreamDataEvent };

export class MissingProviderConfigError extends Error {
  readonly provider: string;
  readonly requiredEnv: readonly string[];

  constructor(provider: string, requiredEnv: readonly string[]) {
    super(`Missing API key for provider "${provider}". Set one of: ${requiredEnv.join(", ")}`);
    this.name = "MissingProviderConfigError";
    this.provider = provider;
    this.requiredEnv = requiredEnv;
  }
}

export class ProviderRequestError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, body: string) {
    super(`Provider request failed with HTTP ${statusCode}: ${body.slice(0, 500)}`);
    this.name = "ProviderRequestError";
    this.statusCode = statusCode;
  }
}

export function resolveProviderSettings(
  provider: string,
  env: ProviderEnv = process.env,
  credential?: ProviderCredential,
): ProviderSettings {
  const definition = resolveProviderDefinition(provider);
  if (definition === undefined) {
    throw new ProviderProtocolError(`unknown provider "${provider}"`);
  }

  const requiredEnv = apiKeyEnvKeys(definition);
  const apiKey = firstEnv(env, requiredEnv) ?? credential?.apiKey;
  if (apiKey === undefined) {
    throw new MissingProviderConfigError(definition.id, requiredEnv);
  }

  const region = regionForProvider(definition, credential?.region);
  const configuredBaseUrl = firstEnv(env, baseUrlEnvKeys(definition)) ?? credential?.baseUrl;
  const baseUrl = configuredBaseUrl ?? region?.baseUrl;
  if (baseUrl === undefined || baseUrl.length === 0) {
    throw new ProviderProtocolError(`missing base URL for provider "${definition.id}"`);
  }

  return {
    provider: definition.id,
    baseUrl: baseUrl.replace(/\/+$/u, ""),
    apiKey,
    apiKeyHeader: definition.apiKeyHeader,
    protocol: definition.protocol,
    extraHeaders: {},
  };
}

export async function resolveProviderSettingsForRequest(
  provider: string,
  env: ProviderEnv = process.env,
  credential?: ProviderCredential,
): Promise<ProviderSettings> {
  const definition = resolveProviderDefinition(provider);
  if (definition?.id !== "openai" || credential?.authMode !== "oauth") {
    return resolveProviderSettings(provider, env, credential);
  }

  try {
    const oauthCredential = await readCodexOAuthCredential(env);
    const extraHeaders = oauthCredential.accountId === undefined
      ? { originator: "codex_cli_rs" }
      : {
        originator: "codex_cli_rs",
        "chatgpt-account-id": oauthCredential.accountId,
      };
    return {
      provider: definition.id,
      baseUrl: oauthCredential.baseUrl,
      apiKey: oauthCredential.accessToken,
      apiKeyHeader: "authorization",
      protocol: "responses",
      extraHeaders,
    };
  } catch (error) {
    if (error instanceof CodexOAuthError) {
      throw new ProviderProtocolError(error.message);
    }
    throw error;
  }
}

export async function streamChatCompletion(input: StreamChatInput): Promise<void> {
  const credential = await readProviderCredential(input.selectedModel.provider, input.configRoot);
  const settings = await resolveProviderSettingsForRequest(input.selectedModel.provider, input.env, credential);
  const response = await request(endpointFor(settings), {
    method: "POST",
    headers: buildProviderRequestHeaders(settings),
    body: JSON.stringify(buildProviderRequestBody(
      settings.protocol,
      providerModelIdForRequest(settings.provider, input.selectedModel.model),
      input.messages,
    )),
    headersTimeout: 15_000,
    bodyTimeout: 120_000,
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ProviderRequestError(response.statusCode, await response.body.text());
  }

  for await (const event of streamEventsFromChunks(response.body, settings.protocol)) {
    switch (event.kind) {
      case "content":
        await input.onToken(event.content);
        break;
      case "done":
        return;
      case "skip":
        break;
      default:
        assertNever(event);
    }
  }
}

function endpointFor(settings: ProviderSettings): string {
  switch (settings.protocol) {
    case "chat-completions":
      return `${settings.baseUrl}/chat/completions`;
    case "responses":
      return `${settings.baseUrl}/responses`;
    default:
      return assertNever(settings.protocol);
  }
}

export function buildProviderRequestHeaders(settings: ProviderSettings): Record<string, string> {
  const authHeader = settings.apiKeyHeader === "api-key"
    ? { "api-key": settings.apiKey }
    : { authorization: `Bearer ${settings.apiKey}` };
  return {
    ...settings.extraHeaders,
    ...authHeader,
    "content-type": "application/json",
  };
}

export function buildProviderRequestBody(
  protocol: ProviderProtocol,
  model: string,
  messages: readonly ChatMessage[],
): Readonly<Record<string, unknown>> {
  switch (protocol) {
    case "chat-completions":
      return { model, messages, stream: true };
    case "responses":
      return responseRequestBody(model, messages);
    default:
      return assertNever(protocol);
  }
}

function responseRequestBody(
  model: string,
  messages: readonly ChatMessage[],
): Readonly<Record<string, unknown>> {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const input = messages.filter((message) => message.role !== "system");
  return instructions.length === 0
    ? { model, input: messages, stream: true }
    : { model, input, instructions, stream: true };
}

function firstEnv(env: ProviderEnv, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected provider variant: ${String(value)}`);
}
