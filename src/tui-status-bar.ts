import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import { ansi, paint } from "./ansi.js";
import { loadCredentials } from "./credentials.js";
import type { DreamConfig, PermissionMode } from "./config.js";
import { resolveEffectivePermissionMode } from "./config.js";
import { selectModelForPrompt } from "./model-routing.js";
import type { ProviderEnv } from "./llm-provider.js";
import { providerIsEnabled } from "./provider-settings.js";
import { listProviderDefinitions } from "./provider-registry.js";
import { listSessions } from "./session-store.js";
import { providerConnectionSource } from "./tui-provider-status.js";

const execFileAsync = promisify(execFile);
const defaultContextWindowTokens = 262_100;

export type BottomStatusInput = {
  readonly model: string;
  readonly mode: "single" | "auto";
  readonly tier: string;
  readonly projectName: string;
  readonly gitBranch: string | undefined;
  readonly gitDirty: boolean;
  readonly contextTokens: number;
  readonly contextWindowTokens: number;
  readonly permission: string;
};

export async function buildBottomStatusLines(options: {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly sessionId: string;
  readonly cwd: string;
  readonly oneShotYolo: boolean;
}): Promise<readonly string[]> {
  const selected = selectModelForPrompt(options.config.model, "status bar", undefined, {
    connectedProviders: await connectedProviderIds(options.configRoot, options.config, process.env),
  });
  const git = await gitStatus(options.cwd);
  return renderBottomStatusLines({
    model: `${selected.provider}/${selected.model}`,
    mode: options.config.model.mode,
    tier: selected.tier,
    projectName: basename(options.cwd) || "workspace",
    gitBranch: git.branch,
    gitDirty: git.dirty,
    contextTokens: await estimateSessionContextTokens(options.configRoot, options.sessionId),
    contextWindowTokens: defaultContextWindowTokens,
    permission: permissionLabel(resolveEffectivePermissionMode(options.config, options.oneShotYolo)),
  });
}

export function renderBottomStatusLines(input: BottomStatusInput): readonly string[] {
  const contextPercent = Math.min(100, Math.round((input.contextTokens / input.contextWindowTokens) * 100));
  const git = input.gitBranch === undefined ? "" : ` ${paint(`git:(${input.gitBranch}${input.gitDirty ? "*" : ""})`, ansi.green)}`;
  return [
    `${paint(`[${modelBadge(input)}]`, ansi.blue)} ${paint("|", ansi.guide)} ${paint(input.projectName, ansi.yellow)}${git}`,
    `${paint("Context", ansi.dim)} ${contextMeter(contextPercent)} ${paint(`${contextPercent}%`, ansi.green)} ${paint(`(${formatTokenCount(input.contextTokens)}/${formatTokenCount(input.contextWindowTokens)})`, ansi.guide)} ${paint("|", ansi.guide)} ${permissionColor(input.permission)}`,
  ];
}

async function connectedProviderIds(
  root: string,
  config: DreamConfig,
  env: ProviderEnv,
): Promise<ReadonlySet<string>> {
  const credentials = await loadCredentials(root);
  return new Set(listProviderDefinitions()
    .filter((definition) => providerConnectionSource(definition, credentials.providers[definition.id], env) !== "missing")
    .filter((definition) => providerIsEnabled(config, definition.id))
    .map((definition) => definition.id));
}

function modelBadge(input: BottomStatusInput): string {
  const prefix = input.mode === "auto" ? "AUTO " : "";
  return `${prefix}${input.model} · ${input.tier}`;
}

async function estimateSessionContextTokens(root: string, sessionId: string): Promise<number> {
  const compact = await readOptionalCompact(root, sessionId);
  if (compact !== undefined) {
    return estimateTokens(compact);
  }
  const session = (await listSessions(root)).find((item) => item.id === sessionId);
  const chars = session?.turns.reduce((total, turn) => total + turn.content.length, 0) ?? 0;
  return estimateTokensByChars(chars);
}

async function readOptionalCompact(root: string, sessionId: string): Promise<string | undefined> {
  try {
    return await readFile(join(root, "compacts", `${sessionId}.md`), "utf8");
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function estimateTokens(text: string): number {
  return estimateTokensByChars(text.length);
}

function estimateTokensByChars(chars: number): number {
  return Math.ceil(chars / 4);
}

async function gitStatus(cwd: string): Promise<{ readonly branch: string | undefined; readonly dirty: boolean }> {
  try {
    const branch = (await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, timeout: 1_000 })).stdout.trim();
    const status = (await execFileAsync("git", ["status", "--porcelain"], { cwd, timeout: 1_000 })).stdout.trim();
    return { branch: branch.length === 0 ? undefined : branch, dirty: status.length > 0 };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { branch: undefined, dirty: false };
    }
    throw error;
  }
}

function contextMeter(percent: number): string {
  const filled = Math.min(10, Math.max(0, Math.round(percent / 10)));
  return `${paint("█".repeat(filled), ansi.green)}${paint("░".repeat(10 - filled), ansi.guide)}`;
}

function formatTokenCount(tokens: number): string {
  return tokens < 1000 ? String(tokens) : `${(tokens / 1000).toFixed(1)}k`;
}

function permissionLabel(mode: PermissionMode): string {
  return mode === "yolo" ? "YOLO" : mode.toUpperCase();
}

function permissionColor(permission: string): string {
  return permission === "YOLO" ? paint("YOLO bypass permissions on", ansi.red) : paint(permission, ansi.guide);
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
