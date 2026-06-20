import { chmod, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { request } from "undici";
import { z } from "zod";

import type { ProviderEnv } from "./llm-provider.js";

export const codexOAuthBaseUrl = "https://chatgpt.com/backend-api/codex";

const codexOAuthTokenUrl = "https://auth.openai.com/oauth/token";
const codexOAuthClientId = "app_EMoamEEZ73f0CkXaXp7hrann";
const refreshSkewSeconds = 30;

export type CodexOAuthCredential = {
  readonly accessToken: string;
  readonly accountId?: string;
  readonly baseUrl: string;
};

const codexTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  account_id: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
});

const codexAuthSchema = z.object({
  auth_mode: z.literal("chatgpt"),
  tokens: codexTokensSchema,
}).passthrough();

const refreshResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
}).passthrough();

const jwtPayloadSchema = z.object({
  exp: z.number().optional(),
}).passthrough();

type CodexTokens = z.infer<typeof codexTokensSchema>;
type CodexAuth = z.infer<typeof codexAuthSchema>;

export class CodexOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexOAuthError";
  }
}

export function codexAuthFilePath(env: ProviderEnv = process.env): string {
  return join(env["CODEX_HOME"] ?? join(homedir(), ".codex"), "auth.json");
}

export async function readCodexOAuthCredential(
  env: ProviderEnv = process.env,
): Promise<CodexOAuthCredential> {
  const filePath = codexAuthFilePath(env);
  const auth = await readCodexAuth(filePath);
  const tokens = await freshTokens(filePath, auth);
  return credentialFromTokens(tokens);
}

async function readCodexAuth(filePath: string): Promise<CodexAuth> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new CodexOAuthError("OpenAI OAuth is not connected. Run `codex login`, then `/login openai oauth`.");
    }
    throw error;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CodexOAuthError(`Could not parse Codex auth at ${filePath}: ${error.message}`);
    }
    throw error;
  }

  const parsedAuth = codexAuthSchema.safeParse(parsedJson);
  if (!parsedAuth.success) {
    throw new CodexOAuthError("Codex auth is not a ChatGPT login. Run `codex login` and choose ChatGPT.");
  }
  return parsedAuth.data;
}

async function freshTokens(filePath: string, auth: CodexAuth): Promise<CodexTokens> {
  const expiresAt = jwtExpiresAt(auth.tokens.access_token);
  if (expiresAt === undefined || expiresAt > nowSeconds() + refreshSkewSeconds) {
    return auth.tokens;
  }
  if (auth.tokens.refresh_token === undefined) {
    throw new CodexOAuthError("Codex OAuth access token is expired. Run `codex login` again.");
  }

  const refreshed = await refreshCodexTokens(auth.tokens.refresh_token);
  const nextTokens: CodexTokens = {
    ...auth.tokens,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? auth.tokens.refresh_token,
    id_token: refreshed.id_token ?? auth.tokens.id_token,
  };
  const nextAuth: CodexAuth = { ...auth, tokens: nextTokens };
  await writeFile(filePath, `${JSON.stringify(nextAuth, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600);
  return nextTokens;
}

async function refreshCodexTokens(refreshToken: string): Promise<z.infer<typeof refreshResponseSchema>> {
  const body = new URLSearchParams({
    client_id: codexOAuthClientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await request(codexOAuthTokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    headersTimeout: 15_000,
    bodyTimeout: 30_000,
  });
  const responseText = await response.body.text();
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new CodexOAuthError(`Codex OAuth refresh failed with HTTP ${response.statusCode}: ${responseText.slice(0, 300)}`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(responseText);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CodexOAuthError(`Codex OAuth refresh returned invalid JSON: ${error.message}`);
    }
    throw error;
  }
  const parsedResponse = refreshResponseSchema.safeParse(parsedJson);
  if (!parsedResponse.success) {
    throw new CodexOAuthError(`Codex OAuth refresh returned an unexpected response: ${parsedResponse.error.message}`);
  }
  return parsedResponse.data;
}

function credentialFromTokens(tokens: CodexTokens): CodexOAuthCredential {
  const credential = {
    accessToken: tokens.access_token,
    baseUrl: codexOAuthBaseUrl,
  };
  return tokens.account_id === undefined
    ? credential
    : { ...credential, accountId: tokens.account_id };
}

function jwtExpiresAt(token: string): number | undefined {
  const payload = token.split(".")[1];
  if (payload === undefined) {
    return undefined;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
  const parsedPayload = jwtPayloadSchema.safeParse(parsedJson);
  return parsedPayload.success ? parsedPayload.data.exp : undefined;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
