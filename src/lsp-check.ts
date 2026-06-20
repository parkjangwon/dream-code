import { access } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { ansi, paint } from "./ansi.js";

const maxOutput = 12_000;

export async function runLspCheck(cwd: string): Promise<string> {
  if (!(await exists(join(cwd, "tsconfig.json")))) {
    return [
      paint("LSP", `${ansi.bold}${ansi.accent}`),
      paint("No TypeScript project detected. Language diagnostics are not attached yet.", ansi.dim),
    ].join("\n");
  }
  const result = await runCommand("pnpm", ["-s", "build"], cwd);
  return [
    paint("LSP", `${ansi.bold}${ansi.accent}`),
    `${paint("TypeScript diagnostics", ansi.blue)} ${result.ok ? paint("clean", ansi.green) : paint("failed", ansi.red)}`,
    result.output.length === 0 ? paint("No diagnostics.", ansi.dim) : result.output,
  ].join("\n");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function runCommand(command: string, args: readonly string[], cwd: string): Promise<{ readonly ok: boolean; readonly output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.on("error", (error) => resolve({ ok: false, output: error.message }));
    child.on("close", (code) => resolve({ ok: code === 0, output: output.trim() }));
  });
}

function appendLimited(base: string, chunk: string): string {
  const next = `${base}${chunk}`;
  return next.length > maxOutput ? `${next.slice(0, maxOutput)}\n[truncated]` : next;
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
