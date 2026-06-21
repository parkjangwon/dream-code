import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import { ansi, paint } from "./ansi.js";
import type { DreamConfig, PermissionMode } from "./config.js";
import { resolveEffectivePermissionMode } from "./config.js";
import { selectModelForPrompt } from "./model-routing.js";
import { formatReasoningEffort, type ReasoningEffort } from "./reasoning-effort.js";
import { listSessions } from "./session-store.js";

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
  readonly reasoningEffort?: ReasoningEffort;
};

export async function buildBottomStatusLines(options: {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly sessionId: string;
  readonly cwd: string;
  readonly oneShotYolo: boolean;
}): Promise<readonly string[]> {
  const selected = options.config.model.mode === "single"
    ? selectModelForPrompt(options.config.model, "status bar")
    : undefined;
  const git = await gitStatus(options.cwd);
  return renderBottomStatusLines({
    model: selected === undefined ? "" : `${selected.provider}/${selected.model}`,
    mode: options.config.model.mode,
    tier: selected?.tier ?? "",
    projectName: basename(options.cwd) || "workspace",
    gitBranch: git.branch,
    gitDirty: git.dirty,
    contextTokens: await estimateSessionContextTokens(options.configRoot, options.sessionId),
    contextWindowTokens: defaultContextWindowTokens,
    permission: permissionLabel(resolveEffectivePermissionMode(options.config, options.oneShotYolo)),
    ...(options.config.model.reasoning?.effort === undefined ? {} : { reasoningEffort: options.config.model.reasoning.effort }),
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

function modelBadge(input: BottomStatusInput): string {
  if (input.mode === "auto") {
    return withThinking("AUTO routing", input.reasoningEffort);
  }
  return withThinking(`${input.model} · ${input.tier}`, input.reasoningEffort);
}

function withThinking(label: string, effort: ReasoningEffort | undefined): string {
  if (effort === undefined || effort === "auto") {
    return label;
  }
  return `${label} · think ${formatReasoningEffort(effort)}`;
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
