import { spawn } from "node:child_process";
import { basename } from "node:path";

import { riskyShellReason } from "./shell-safety.js";

export type ParsedShellCommand = {
  readonly executable: string;
  readonly args: readonly string[];
};

export type ShellCommandPolicy = {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
};

export type ShellCommandResult = {
  readonly ok: boolean;
  readonly output: string;
};

const defaultTimeoutMs = 120_000;
const maxOutput = 12_000;
const allowedExecutables = new Set([
  "awk",
  "bun",
  "cargo",
  "cat",
  "date",
  "deno",
  "echo",
  "find",
  "git",
  "go",
  "grep",
  "head",
  "ls",
  "node",
  "npm",
  "npx",
  "pnpm",
  "pwd",
  "python",
  "python3",
  "printf",
  "rg",
  "sed",
  "tail",
  "tsc",
  "wc",
]);

export function parseShellCommand(command: string): ParsedShellCommand {
  const tokens = tokenizeCommand(command);
  const executable = tokens[0];
  if (executable === undefined) {
    throw new ShellCommandError("empty shell command");
  }
  return { executable, args: tokens.slice(1) };
}

export function assertShellCommandAllowed(command: string): ParsedShellCommand {
  const risk = riskyShellReason(command);
  if (risk !== undefined) {
    throw new ShellCommandError(risk);
  }

  const parsed = parseShellCommand(command);
  const executableName = basename(parsed.executable);
  if (!allowedExecutables.has(executableName)) {
    throw new ShellCommandError(`executable is not allowlisted: ${executableName}`);
  }
  return parsed;
}

export function runCapturedCommand(command: string, policy: ShellCommandPolicy = {}): Promise<ShellCommandResult> {
  return new Promise((resolve) => {
    let parsed: ParsedShellCommand;
    try {
      parsed = assertShellCommandAllowed(command);
    } catch (error) {
      resolve({ ok: false, output: `blocked: ${errorMessage(error)}` });
      return;
    }

    if (policy.signal?.aborted === true) {
      resolve({ ok: false, output: "cancelled" });
      return;
    }

    const child = spawn(parsed.executable, parsed.args, {
      shell: false,
      env: policy.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => {
      finish(false, `timed out after ${policy.timeoutMs ?? defaultTimeoutMs}ms\n${output}`.trim());
      child.kill("SIGTERM");
    }, policy.timeoutMs ?? defaultTimeoutMs);
    const abort = (): void => {
      finish(false, `cancelled\n${output}`.trim());
      child.kill("SIGTERM");
    };
    const finish = (ok: boolean, text: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      policy.signal?.removeEventListener("abort", abort);
      resolve({ ok, output: text });
    };
    policy.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      finish(false, error.message);
    });
    child.on("close", (code) => {
      finish(code === 0, `exit ${code ?? 1}\n${output}`.trim());
    });
  });
}

export function runInheritedCommand(command: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let parsed: ParsedShellCommand;
    try {
      parsed = assertShellCommandAllowed(command);
    } catch (error) {
      reject(error);
      return;
    }
    const child = spawn(parsed.executable, parsed.args, { shell: false, stdio: "inherit" });
    child.once("error", (error) => {
      reject(error);
    });
    child.once("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

export class ShellCommandError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ShellCommandError";
  }
}

function tokenizeCommand(command: string): readonly string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "\"" | "'" | undefined;
  let escaped = false;

  for (const char of command.trim()) {
    if (escaped) {
      current = `${current}${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      if (char === quote) {
        quote = undefined;
      } else {
        current = `${current}${char}`;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (isShellMetacharacter(char)) {
      throw new ShellCommandError(`shell metacharacter blocked: ${char}`);
    }
    if (/\s/u.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current = `${current}${char}`;
  }

  if (escaped) {
    throw new ShellCommandError("unfinished escape sequence");
  }
  if (quote !== undefined) {
    throw new ShellCommandError("unterminated quoted argument");
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function isShellMetacharacter(char: string): boolean {
  return char === ";" || char === "&" || char === "|" || char === "<" || char === ">" || char === "`" || char === "$";
}

function appendLimited(base: string, chunk: string): string {
  const next = `${base}${chunk}`;
  return next.length > maxOutput ? `${next.slice(0, maxOutput)}\n[truncated]` : next;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown shell command error";
}
