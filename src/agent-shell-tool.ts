import { spawn } from "node:child_process";

import { riskyShellReason } from "./shell-safety.js";

export type ShellCaptureOptions = {
  readonly signal?: AbortSignal;
  readonly shellTimeoutMs?: number;
};

export type ShellCaptureResult = {
  readonly ok: boolean;
  readonly output: string;
};

const maxShellOutput = 12_000;
const defaultShellTimeoutMs = 120_000;

export function runShellCapture(command: string, policy: ShellCaptureOptions): Promise<ShellCaptureResult> {
  return new Promise((resolve) => {
    const risk = riskyShellReason(command);
    if (policy.signal?.aborted === true) {
      resolve({ ok: false, output: shellOutput(risk, "cancelled") });
      return;
    }
    if (risk !== undefined) {
      resolve({ ok: false, output: `blocked: ${risk}` });
      return;
    }
    const child = spawn(command, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => {
      finish(false, `timed out after ${policy.shellTimeoutMs ?? defaultShellTimeoutMs}ms\n${output}`.trim());
      child.kill("SIGTERM");
    }, policy.shellTimeoutMs ?? defaultShellTimeoutMs);
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
      resolve({ ok, output: shellOutput(risk, text) });
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

function shellOutput(risk: string | undefined, output: string): string {
  return risk === undefined ? output : `risk: ${risk}\n${output}`;
}

function appendLimited(base: string, chunk: string): string {
  const next = `${base}${chunk}`;
  return next.length > maxShellOutput ? `${next.slice(0, maxShellOutput)}\n[truncated]` : next;
}
