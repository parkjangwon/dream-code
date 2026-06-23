import { runCapturedCommand } from "./shell-command.js";

export type ShellCaptureOptions = {
  readonly signal?: AbortSignal;
  readonly shellTimeoutMs?: number;
  readonly allowedExecutables?: readonly string[];
};

export type ShellCaptureResult = {
  readonly ok: boolean;
  readonly output: string;
};

const defaultShellTimeoutMs = 120_000;

export function runShellCapture(command: string, policy: ShellCaptureOptions): Promise<ShellCaptureResult> {
  return runCapturedCommand(command, {
    ...(policy.signal === undefined ? {} : { signal: policy.signal }),
    ...(policy.allowedExecutables === undefined ? {} : { allowedExecutables: policy.allowedExecutables }),
    timeoutMs: policy.shellTimeoutMs ?? defaultShellTimeoutMs,
  });
}
