import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { defaultConfigRoot } from "./config.js";

export type ProviderCredential = {
  readonly authMode?: "api-key" | "oauth" | "none" | undefined;
  readonly apiKey?: string | undefined;
  readonly baseUrl?: string | undefined;
  readonly region?: string | undefined;
  readonly accountId?: string | undefined;
};

export type DreamCredentials = {
  readonly version: 1;
  readonly providers: Readonly<Record<string, ProviderCredential>>;
};

const providerCredentialSchema = z.object({
  authMode: z.enum(["api-key", "oauth", "none"]).optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  region: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
});

const credentialsSchema = z.object({
  version: z.literal(1),
  providers: z.record(z.string(), providerCredentialSchema),
});

export class CredentialsParseError extends Error {
  readonly filePath: string;

  constructor(filePath: string, reason: string) {
    super(`Could not parse Dream Code credentials at ${filePath}: ${reason}`);
    this.name = "CredentialsParseError";
    this.filePath = filePath;
  }
}

export function emptyCredentials(): DreamCredentials {
  return {
    version: 1,
    providers: {},
  };
}

export function credentialsFilePath(root = defaultConfigRoot()): string {
  return join(root, "credentials.json");
}

export async function loadCredentials(root = defaultConfigRoot()): Promise<DreamCredentials> {
  const filePath = credentialsFilePath(root);
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return emptyCredentials();
    }
    throw error;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CredentialsParseError(filePath, error.message);
    }
    throw error;
  }

  const parsedCredentials = credentialsSchema.safeParse(parsedJson);
  if (!parsedCredentials.success) {
    throw new CredentialsParseError(filePath, parsedCredentials.error.message);
  }
  return parsedCredentials.data;
}

export async function saveCredentials(
  root: string,
  credentials: DreamCredentials,
): Promise<void> {
  await mkdir(root, { recursive: true });
  const filePath = credentialsFilePath(root);
  await writeFile(filePath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600);
}

export async function readProviderCredential(
  providerId: string,
  root = defaultConfigRoot(),
): Promise<ProviderCredential | undefined> {
  const credentials = await loadCredentials(root);
  return credentials.providers[providerId];
}

export async function writeProviderCredential(
  root: string,
  providerId: string,
  credential: ProviderCredential,
): Promise<DreamCredentials> {
  const credentials = await loadCredentials(root);
  const nextCredentials: DreamCredentials = {
    version: 1,
    providers: {
      ...credentials.providers,
      [providerId]: compactCredential(credential),
    },
  };
  await saveCredentials(root, nextCredentials);
  return nextCredentials;
}

export async function deleteProviderCredential(
  root: string,
  providerId: string,
): Promise<boolean> {
  const credentials = await loadCredentials(root);
  if (credentials.providers[providerId] === undefined) {
    return false;
  }
  const nextProviders = { ...credentials.providers };
  delete nextProviders[providerId];
  await saveCredentials(root, { version: 1, providers: nextProviders });
  return true;
}

function compactCredential(credential: ProviderCredential): ProviderCredential {
  const result: {
    authMode?: "api-key" | "oauth" | "none";
    apiKey?: string;
    baseUrl?: string;
    region?: string;
    accountId?: string;
  } = {};

  if (credential.authMode !== undefined) {
    result.authMode = credential.authMode;
  }
  if (isNonEmptyString(credential.apiKey)) {
    result.apiKey = credential.apiKey.trim();
  }
  if (isNonEmptyString(credential.baseUrl)) {
    result.baseUrl = credential.baseUrl.trim().replace(/\/+$/u, "");
  }
  if (isNonEmptyString(credential.region)) {
    result.region = credential.region.trim();
  }
  if (isNonEmptyString(credential.accountId)) {
    result.accountId = credential.accountId.trim();
  }
  return result;
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}
