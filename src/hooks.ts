import { spawn } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { ansi, paint } from "./ansi.js";

const hookEventSchema = z.enum(["preTool", "postTool", "postCommand"]);
const hookSchema = z.object({
  event: hookEventSchema,
  command: z.string().min(1),
  enabled: z.boolean(),
});

export type HookEvent = z.infer<typeof hookEventSchema>;
export type HookDefinition = z.infer<typeof hookSchema>;
export type HookMetadata = Readonly<Record<string, string>>;
export type HookRunResult = {
  readonly hook: HookDefinition;
  readonly ok: boolean;
  readonly output: string;
};

const hookTimeoutMs = 5_000;
const maxHookOutput = 4_000;

export function hooksFilePath(root: string): string {
  return join(root, "hooks.toml");
}

export function hooksLogFilePath(root: string): string {
  return join(root, "hooks.log.jsonl");
}

export async function loadHooks(root: string): Promise<readonly HookDefinition[]> {
  const raw = await readOptional(hooksFilePath(root));
  return raw === undefined ? [] : parseHooks(raw, hooksFilePath(root));
}

export async function formatHooksStatus(root: string): Promise<string> {
  const hooks = await loadHooks(root);
  const recent = await readRecentHookLogs(root);
  return [
    paint("Hooks", `${ansi.bold}${ansi.accent}`),
    `${paint("config", ansi.muted)} ${paint(hooksFilePath(root), ansi.blue)}`,
    `${paint("log", ansi.muted)} ${paint(hooksLogFilePath(root), ansi.blue)}`,
    ...(hooks.length === 0
      ? [paint("No hooks configured.", ansi.dim)]
      : hooks.map((hook) => `${paint(hook.enabled ? "on " : "off", hook.enabled ? ansi.green : ansi.muted)} ${hook.event.padEnd(11)} ${hook.command}`)),
    ...(recent.length === 0 ? [] : [
      paint("Recent runs", `${ansi.bold}${ansi.muted}`),
      ...recent.map((run) => `${paint(run.ok ? "ok " : "fail", run.ok ? ansi.green : ansi.yellow)} ${run.event.padEnd(11)} ${run.command}`),
    ]),
  ].join("\n");
}

export async function runHookEvent(root: string, event: HookEvent, metadata: HookMetadata): Promise<readonly HookRunResult[]> {
  const hooks = (await loadHooks(root)).filter((hook) => hook.enabled && hook.event === event);
  const results: HookRunResult[] = [];
  for (const hook of hooks) {
    const result = { hook, ...(await runHookCommand(hook.command, metadata)) };
    results.push(result);
    await appendHookLog(root, event, result);
  }
  return results;
}

function parseHooks(raw: string, filePath: string): readonly HookDefinition[] {
  return raw.split(/\[\[hook\]\]/u).slice(1).map((block) => parseHookBlock(block, filePath));
}

function parseHookBlock(block: string, filePath: string): HookDefinition {
  const values = new Map(block.split(/\r?\n/u).flatMap(parseKeyValueLine));
  const parsed = hookSchema.safeParse({
    event: values.get("event"),
    command: values.get("command"),
    enabled: values.get("enabled") !== "false",
  });
  if (!parsed.success) {
    throw new HookParseError(filePath, parsed.error.message);
  }
  return parsed.data;
}

function parseKeyValueLine(line: string): readonly [string, string][] {
  const match = /^\s*([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+?)\s*$/u.exec(line);
  if (match?.[1] === undefined || match[2] === undefined) {
    return [];
  }
  return [[match[1], unquote(match[2])]];
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("\"") && trimmed.endsWith("\"") ? trimmed.slice(1, -1) : trimmed;
}

function runHookCommand(command: string, metadata: HookMetadata): Promise<Pick<HookRunResult, "ok" | "output">> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      env: { ...process.env, ...hookEnv(metadata) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timeout = setTimeout(() => child.kill(), hookTimeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, output: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ ok: code === 0, output: output.trim() });
    });
  });
}

type HookLogEntry = {
  readonly ts: string;
  readonly event: HookEvent;
  readonly command: string;
  readonly ok: boolean;
  readonly output: string;
};

async function appendHookLog(root: string, event: HookEvent, result: HookRunResult): Promise<void> {
  const entry: HookLogEntry = {
    ts: new Date().toISOString(),
    event,
    command: result.hook.command,
    ok: result.ok,
    output: result.output,
  };
  await appendFile(hooksLogFilePath(root), `${JSON.stringify(entry)}\n`, "utf8");
}

async function readRecentHookLogs(root: string): Promise<readonly HookLogEntry[]> {
  const raw = await readOptional(hooksLogFilePath(root));
  if (raw === undefined) {
    return [];
  }
  return raw.trim().split(/\r?\n/u).filter(Boolean).slice(-3).flatMap(parseHookLog);
}

function parseHookLog(line: string): readonly HookLogEntry[] {
  try {
    const parsed: unknown = JSON.parse(line);
    if (!isRecord(parsed) || typeof parsed["ts"] !== "string" || typeof parsed["event"] !== "string" || typeof parsed["command"] !== "string" || typeof parsed["ok"] !== "boolean") {
      return [];
    }
    return [{
      ts: parsed["ts"],
      event: hookEventSchema.parse(parsed["event"]),
      command: parsed["command"],
      ok: parsed["ok"],
      output: typeof parsed["output"] === "string" ? parsed["output"] : "",
    }];
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return [];
    }
    throw error;
  }
}

function appendLimited(base: string, chunk: string): string {
  const next = `${base}${chunk}`;
  return next.length > maxHookOutput ? `${next.slice(0, maxHookOutput)}\n[truncated]` : next;
}

function hookEnv(metadata: HookMetadata): Record<string, string> {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [`DREAM_${key.toUpperCase()}`, value]));
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export class HookParseError extends Error {
  readonly filePath: string;

  constructor(filePath: string, reason: string) {
    super(`Could not parse Dream Code hooks at ${filePath}: ${reason}`);
    this.name = "HookParseError";
    this.filePath = filePath;
  }
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
