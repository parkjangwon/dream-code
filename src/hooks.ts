import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
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

export function hooksFilePath(root: string): string {
  return join(root, "hooks.toml");
}

export async function loadHooks(root: string): Promise<readonly HookDefinition[]> {
  const raw = await readOptional(hooksFilePath(root));
  return raw === undefined ? [] : parseHooks(raw, hooksFilePath(root));
}

export async function formatHooksStatus(root: string): Promise<string> {
  const hooks = await loadHooks(root);
  return [
    paint("Hooks", `${ansi.bold}${ansi.accent}`),
    `${paint("config", ansi.muted)} ${paint(hooksFilePath(root), ansi.blue)}`,
    ...(hooks.length === 0
      ? [paint("No hooks configured.", ansi.dim)]
      : hooks.map((hook) => `${paint(hook.enabled ? "on " : "off", hook.enabled ? ansi.green : ansi.muted)} ${hook.event.padEnd(11)} ${hook.command}`)),
  ].join("\n");
}

export async function runHookEvent(root: string, event: HookEvent, metadata: HookMetadata): Promise<readonly HookRunResult[]> {
  const hooks = (await loadHooks(root)).filter((hook) => hook.enabled && hook.event === event);
  const results: HookRunResult[] = [];
  for (const hook of hooks) {
    results.push({ hook, ...(await runHookCommand(hook.command, metadata)) });
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
      output = `${output}${chunk.toString("utf8")}`;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`;
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
