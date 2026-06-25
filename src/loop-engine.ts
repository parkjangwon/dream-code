import type { LoopEvaluatorSpec, LoopSpec } from "./loop-spec.js";
import { runCommandEvaluator, type LoopCommandEvaluation } from "./loop-command-evaluator.js";

export type { LoopCommandEvaluation } from "./loop-command-evaluator.js";

export type LoopAgentInput = {
  readonly spec: LoopSpec;
  readonly turn: number;
  readonly prompt: string;
  readonly previousEvaluation?: LoopCommandEvaluation;
};

export type LoopAgentRunner = (input: LoopAgentInput) => Promise<string>;

export type LoopRunEvent = {
  readonly type: "agent" | "evaluate";
  readonly turn: number;
  readonly status: "started" | "done" | "failed";
  readonly elapsedMs: number;
  readonly summary: string;
  readonly error?: string;
};

export type RunLoopSpecInput = {
  readonly workspace: string;
  readonly spec: LoopSpec;
  readonly runAgent: LoopAgentRunner;
  readonly signal?: AbortSignal;
  readonly killGraceMs?: number;
};

export type LoopRunResult =
  | { readonly status: "passed"; readonly turns: number; readonly evaluations: readonly LoopCommandEvaluation[]; readonly events: readonly LoopRunEvent[]; readonly durationMs: number }
  | { readonly status: "exhausted"; readonly turns: number; readonly evaluations: readonly LoopCommandEvaluation[]; readonly events: readonly LoopRunEvent[]; readonly durationMs: number }
  | { readonly status: "cancelled"; readonly turns: number; readonly evaluations: readonly LoopCommandEvaluation[]; readonly events: readonly LoopRunEvent[]; readonly durationMs: number }
  | { readonly status: "failed"; readonly turns: number; readonly evaluations: readonly LoopCommandEvaluation[]; readonly events: readonly LoopRunEvent[]; readonly durationMs: number; readonly error: string };

export async function runLoopSpec(input: RunLoopSpecInput): Promise<LoopRunResult> {
  const startedAt = Date.now();
  const events: LoopRunEvent[] = [];
  const evaluations: LoopCommandEvaluation[] = [];
  let previousEvaluation: LoopCommandEvaluation | undefined;

  for (let turn = 1; turn <= input.spec.maxTurns; turn += 1) {
    try {
      await runAgentTurn(input, turn, previousEvaluation, repeatedFailureStreak(evaluations), events);
      const evaluation = await runEvaluator(input.workspace, input.spec.evaluator, turn, events, input);
      evaluations.push(evaluation);
      previousEvaluation = evaluation;
      if (evaluation.cancelled) {
        return { status: "cancelled", turns: turn, evaluations, events, durationMs: Date.now() - startedAt };
      }
      if (evaluation.passed) {
        return { status: "passed", turns: turn, evaluations, events, durationMs: Date.now() - startedAt };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown loop failure";
      return {
        status: "failed",
        turns: turn,
        evaluations,
        events,
        durationMs: Date.now() - startedAt,
        error: message,
      };
    }
  }

  return {
    status: "exhausted",
    turns: input.spec.maxTurns,
    evaluations,
    events,
    durationMs: Date.now() - startedAt,
  };
}

function buildLoopPrompt(
  spec: LoopSpec,
  turn: number,
  previousEvaluation: LoopCommandEvaluation | undefined,
  failureStreak: number,
): string {
  return [
    "Dream Code loop turn. Make concrete progress, then stop for evaluation.",
    `Loop: ${spec.name}`,
    `Goal: ${spec.goal}`,
    `Turn: ${turn} of ${spec.maxTurns}`,
    previousEvaluation === undefined ? "Previous evaluation: none" : formatPreviousEvaluation(previousEvaluation),
    failureStreak >= 2 ? `Repeated evaluator failure: ${failureStreak} consecutive matches. Diagnose the shared failure signature and change strategy before trying again.` : "",
    "Task:",
    spec.prompt ?? spec.goal,
  ].filter((line) => line.length > 0).join("\n");
}

async function runAgentTurn(
  input: RunLoopSpecInput,
  turn: number,
  previousEvaluation: LoopCommandEvaluation | undefined,
  failureStreak: number,
  events: LoopRunEvent[],
): Promise<void> {
  const startedAt = Date.now();
  events.push({ type: "agent", turn, status: "started", elapsedMs: 0, summary: "agent turn started" });
  try {
    const prompt = buildLoopPrompt(input.spec, turn, previousEvaluation, failureStreak);
    const transcript = await input.runAgent({
      spec: input.spec,
      turn,
      prompt,
      ...(previousEvaluation === undefined ? {} : { previousEvaluation }),
    });
    events.push({
      type: "agent",
      turn,
      status: "done",
      elapsedMs: Date.now() - startedAt,
      summary: oneLine(transcript),
    });
  } catch (error) {
    events.push({
      type: "agent",
      turn,
      status: "failed",
      elapsedMs: Date.now() - startedAt,
      summary: "agent turn failed",
      error: errorMessage(error),
    });
    throw error;
  }
}

async function runEvaluator(
  workspace: string,
  evaluator: LoopEvaluatorSpec,
  turn: number,
  events: LoopRunEvent[],
  input: RunLoopSpecInput,
): Promise<LoopCommandEvaluation> {
  const startedAt = Date.now();
  events.push({ type: "evaluate", turn, status: "started", elapsedMs: 0, summary: evaluator.command });
  try {
    const evaluation = await runCommandEvaluator({
      workspace,
      evaluator,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      ...(input.killGraceMs === undefined ? {} : { killGraceMs: input.killGraceMs }),
    });
    events.push({
      type: "evaluate",
      turn,
      status: "done",
      elapsedMs: Date.now() - startedAt,
      summary: formatEvaluationSummary(evaluation),
    });
    return evaluation;
  } catch (error) {
    events.push({
      type: "evaluate",
      turn,
      status: "failed",
      elapsedMs: Date.now() - startedAt,
      summary: "evaluator failed",
      error: errorMessage(error),
    });
    throw error;
  }
}

function formatPreviousEvaluation(evaluation: LoopCommandEvaluation): string {
  return [
    `Previous evaluation: ${evaluation.passed ? "passed" : "failed"}`,
    `Command: ${evaluation.command} ${evaluation.args.join(" ")}`,
    `Exit code: ${evaluation.exitCode ?? "signal"}`,
    evaluation.stdout.length === 0 ? "" : `stdout: ${summarizeOutput(evaluation.stdout)}`,
    evaluation.stderr.length === 0 ? "" : `stderr: ${summarizeOutput(evaluation.stderr)}`,
  ].filter((line) => line.length > 0).join("\n");
}

function formatEvaluationSummary(evaluation: LoopCommandEvaluation): string {
  if (evaluation.cancelled) {
    return `${evaluation.command} cancelled`;
  }
  const code = evaluation.exitCode ?? "signal";
  const result = evaluation.passed ? "passed" : "failed";
  const timeout = evaluation.timedOut ? " timed out" : "";
  return `${evaluation.command} exit ${code} ${result}${timeout}`;
}

function summarizeOutput(value: string): string {
  const lines = value.split(/\r?\n/u).filter((line) => line.length > 0);
  const tail = lines.slice(-12).join("\n");
  return tail.length > 1_200 ? tail.slice(tail.length - 1_200) : tail;
}

function repeatedFailureStreak(evaluations: readonly LoopCommandEvaluation[]): number {
  const [latest] = [...evaluations].reverse();
  if (latest === undefined || latest.passed || latest.cancelled) {
    return 0;
  }
  const signature = failureSignature(latest);
  let streak = 0;
  for (const evaluation of [...evaluations].reverse()) {
    if (evaluation.passed || evaluation.cancelled || failureSignature(evaluation) !== signature) {
      break;
    }
    streak += 1;
  }
  return streak;
}

function failureSignature(evaluation: LoopCommandEvaluation): string {
  return [
    evaluation.command,
    ...evaluation.args,
    String(evaluation.exitCode ?? "signal"),
    summarizeOutput(evaluation.stdout),
    summarizeOutput(evaluation.stderr),
  ].join("\u001f");
}

function oneLine(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown loop failure";
}
