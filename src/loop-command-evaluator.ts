import { spawn } from "node:child_process";

import type { LoopEvaluatorSpec } from "./loop-spec.js";

export type LoopCommandEvaluation = {
  readonly type: "command";
  readonly passed: boolean;
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly elapsedMs: number;
};

export type CommandEvaluatorOptions = {
  readonly workspace: string;
  readonly evaluator: LoopEvaluatorSpec;
  readonly signal?: AbortSignal;
  readonly killGraceMs?: number;
};

export function runCommandEvaluator(options: CommandEvaluatorOptions): Promise<LoopCommandEvaluation> {
  const startedAt = Date.now();
  return new Promise((resolvePromise, rejectPromise) => {
    if (options.signal?.aborted === true) {
      resolvePromise(cancelledEvaluation(options.evaluator, startedAt));
      return;
    }

    const child = spawn(options.evaluator.command, options.evaluator.args, {
      cwd: options.workspace,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let cancelled = false;
    let terminating = false;
    let killTimer: NodeJS.Timeout | undefined;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminateChild();
    }, options.evaluator.timeoutMs);
    const abortListener = (): void => {
      cancelled = true;
      terminateChild();
    };
    options.signal?.addEventListener("abort", abortListener, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = capOutput(`${stdout}${chunk.toString("utf8")}`);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = capOutput(`${stderr}${chunk.toString("utf8")}`);
    });
    child.on("error", (error) => {
      cleanup();
      if (!settled) {
        settled = true;
        rejectPromise(error);
      }
    });
    child.on("close", (code) => {
      cleanup();
      if (settled) {
        return;
      }
      settled = true;
      const passed = code !== null && !timedOut && !cancelled && options.evaluator.passExitCodes.includes(code);
      resolvePromise({
        type: "command",
        passed,
        command: options.evaluator.command,
        args: options.evaluator.args,
        exitCode: code,
        timedOut,
        cancelled,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        elapsedMs: Date.now() - startedAt,
      });
    });

    function terminateChild(): void {
      if (terminating) {
        return;
      }
      terminating = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, options.killGraceMs ?? 1_000);
    }

    function cleanup(): void {
      clearTimeout(timeoutTimer);
      if (killTimer !== undefined) {
        clearTimeout(killTimer);
      }
      options.signal?.removeEventListener("abort", abortListener);
    }
  });
}

function cancelledEvaluation(evaluator: LoopEvaluatorSpec, startedAt: number): LoopCommandEvaluation {
  return {
    type: "command",
    passed: false,
    command: evaluator.command,
    args: evaluator.args,
    exitCode: null,
    timedOut: false,
    cancelled: true,
    stdout: "",
    stderr: "",
    elapsedMs: Date.now() - startedAt,
  };
}

function capOutput(value: string): string {
  return value.length > 8_000 ? value.slice(value.length - 8_000) : value;
}
