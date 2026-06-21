import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";

import { ansi, paint } from "./ansi.js";
import type { DreamConfig, PermissionMode } from "./config.js";
import { resolveEffectivePermissionMode } from "./config.js";
import { selectModelForPrompt } from "./model-routing.js";
import { listSessions } from "./session-store.js";

const execFileAsync = promisify(execFile);
const defaultContextWindowTokens = 262_100;

export type BottomStatusInput = {
  readonly model: string;
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
  const selected = selectModelForPrompt(options.config.model, "status bar");
  const git = await gitStatus(options.cwd);
  return renderBottomStatusLines({
    model: `${selected.provider}/${selected.model}`,
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
    `${paint(`[${input.model} · ${input.tier}]`, ansi.blue)} ${paint("|", ansi.guide)} ${paint(input.projectName, ansi.yellow)}${git}`,
    `${paint("Context", ansi.dim)} ${contextMeter(contextPercent)} ${paint(`${contextPercent}%`, ansi.green)} ${paint(`(${formatTokenCount(input.contextTokens)}/${formatTokenCount(input.contextWindowTokens)})`, ansi.guide)} ${paint("|", ansi.guide)} ${permissionColor(input.permission)}`,
  ];
}

async function estimateSessionContextTokens(root: string, sessionId: string): Promise<number> {
  const session = (await listSessions(root)).find((item) => item.id === sessionId);
  const chars = session?.turns.reduce((total, turn) => total + turn.content.length, 0) ?? 0;
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
