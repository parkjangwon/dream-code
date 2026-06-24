import { basename } from "node:path";
import { stdout as output } from "node:process";

import { runAgentPrompt } from "./agent-runner.js";
import { ansi, paint, stripAnsi } from "./ansi.js";
import { resolveEffectivePermissionMode } from "./config.js";
import { completeGoalState, recordGoalEvidence, startGoalState } from "./goal-state.js";
import { runLoopSpec, type LoopAgentInput, type LoopAgentRunner, type LoopRunResult } from "./loop-engine.js";
import { saveLoopRun } from "./loop-runs.js";
import { assertShellCommandAllowed, type ParsedShellCommand } from "./shell-command.js";
import type { LoopSpec } from "./loop-spec.js";
import type { UtilityCommandOptions } from "./tui-utility-commands.js";
import { appendTask, appendWorkflowNote } from "./workspace-state.js";

export type DriveCommandOptions = UtilityCommandOptions & {
  readonly runAgent?: LoopAgentRunner;
};

type DriveArgs =
  | {
    readonly kind: "agent";
    readonly objective: string;
  }
  | {
    readonly kind: "checked";
    readonly objective: string;
    readonly maxTurns: number;
    readonly check: ParsedShellCommand;
    readonly checkDisplay: string;
  }
  | {
    readonly kind: "usage";
  }
  | {
    readonly kind: "blocked";
    readonly reason: string;
  };

const defaultDriveTurns = 5;

export async function runDriveCommand(options: DriveCommandOptions): Promise<void> {
  const args = parseDriveArgs(options);
  switch (args.kind) {
    case "usage":
      output.write("usage: /drive <objective> [--turns N] [--check command args...]\n");
      return;
    case "blocked":
      output.write(`${paint("drive blocked:", ansi.red)} ${args.reason}\n`);
      return;
    case "agent":
      await runAgentDrive(options, args.objective);
      return;
    case "checked":
      await runCheckedDrive(options, args);
      return;
    default:
      assertNever(args);
  }
}

function parseDriveArgs(options: DriveCommandOptions): DriveArgs {
  const raw = options.rest.trim();
  if (raw.length === 0) {
    return { kind: "usage" };
  }
  const checkIndex = raw.indexOf("--check");
  const objectivePart = checkIndex === -1 ? raw : raw.slice(0, checkIndex).trim();
  const turns = parseTurns(objectivePart);
  const objective = stripTurns(objectivePart).trim();
  if (objective.length === 0) {
    return { kind: "usage" };
  }
  if (checkIndex === -1) {
    return { kind: "agent", objective };
  }
  const checkDisplay = raw.slice(checkIndex + "--check".length).trim();
  if (checkDisplay.length === 0) {
    return { kind: "blocked", reason: "--check needs a command" };
  }
  try {
    const check = assertShellCommandAllowed(checkDisplay, {
      allowedExecutables: options.config.tools.shell.allowedExecutables,
    });
    return { kind: "checked", objective, maxTurns: turns, check, checkDisplay };
  } catch (error) {
    if (error instanceof Error) {
      return { kind: "blocked", reason: error.message };
    }
    throw error;
  }
}

async function runAgentDrive(options: DriveCommandOptions, objective: string): Promise<void> {
  await persistDriveStart(options.configRoot, objective);
  output.write(`${paint("Drive", `${ansi.bold}${ansi.accent}`)} ${paint(objective, ansi.blue)}\n`);
  await runAgentPrompt({
    config: options.config,
    configRoot: options.configRoot,
    cwd: options.cwd,
    prompt: buildDrivePrompt(objective, undefined),
    runLabel: "Drive",
    ...(options.sessionRuntime === undefined ? {} : { sessionId: options.sessionRuntime.currentId() }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    write: (chunk) => output.write(chunk),
  });
  await recordGoalEvidence(options.configRoot, "Drive agent turn completed; awaiting concrete verification evidence.");
}

async function runCheckedDrive(
  options: DriveCommandOptions,
  args: Extract<DriveArgs, { readonly kind: "checked" }>,
): Promise<void> {
  await persistDriveStart(options.configRoot, args.objective);
  if (!(await confirmDriveCheck(options, args.checkDisplay))) {
    output.write(`${paint("drive blocked:", ansi.yellow)} check command was not approved\n`);
    return;
  }

  const spec = driveLoopSpec(args);
  output.write(`${paint("Drive", `${ansi.bold}${ansi.accent}`)} ${paint(args.objective, ansi.blue)}\n`);
  output.write(`${paint("check:", ansi.dim)} ${args.checkDisplay}\n`);
  const result = await runLoopSpec({
    workspace: options.cwd,
    spec,
    runAgent: options.runAgent ?? ((input) => runDefaultDriveAgent(options, input)),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const runPath = await saveLoopRun(options.configRoot, {
    specPath: `drive:${args.objective}`,
    workspace: options.cwd,
    spec,
    result,
  });
  await finishDriveGoal(options.configRoot, args.checkDisplay, result);
  output.write(formatDriveResult(result));
  output.write(`${paint("drive run:", ansi.dim)} ${paint(runPath, ansi.blue)}\n`);
}

async function persistDriveStart(configRoot: string, objective: string): Promise<void> {
  await startGoalState(configRoot, objective);
  await appendWorkflowNote(configRoot, "goals.md", "Drive", objective);
  await appendTask(configRoot, "Drive", objective);
}

function driveLoopSpec(args: Extract<DriveArgs, { readonly kind: "checked" }>): LoopSpec {
  return {
    version: 1,
    name: `drive-${slug(args.objective)}`,
    goal: args.objective,
    prompt: buildDrivePrompt(args.objective, args.checkDisplay),
    maxTurns: args.maxTurns,
    evaluator: {
      type: "command",
      command: args.check.executable,
      args: [...args.check.args],
      passExitCodes: [0],
      timeoutMs: 120_000,
    },
  };
}

function buildDrivePrompt(objective: string, checkDisplay: string | undefined): string {
  return [
    "Drive mode: drive this goal to a verifiable outcome.",
    "Do not stop at analysis. Make the smallest safe code change, run focused verification, and report remaining risk.",
    `Objective: ${objective}`,
    checkDisplay === undefined ? "Verification: choose and run the strongest relevant checks." : `Verification command: ${checkDisplay}`,
    "Expected final shape: changed files, evidence, remaining risks, and next action only if blocked.",
  ].join("\n");
}

async function runDefaultDriveAgent(options: DriveCommandOptions, input: LoopAgentInput): Promise<string> {
  let transcript = "";
  await runAgentPrompt({
    config: options.config,
    configRoot: options.configRoot,
    cwd: options.cwd,
    prompt: input.prompt,
    runLabel: `Drive #${input.turn}`,
    ...(options.sessionRuntime === undefined ? {} : { sessionId: options.sessionRuntime.currentId() }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    write: (chunk) => {
      transcript = `${transcript}${stripAnsi(chunk)}`;
      output.write(chunk);
    },
  });
  return transcript.trim();
}

async function confirmDriveCheck(options: DriveCommandOptions, checkDisplay: string): Promise<boolean> {
  if (resolveEffectivePermissionMode(options.config, options.oneShotYolo) === "yolo") {
    return true;
  }
  const answer = await options.questioner.question(`run drive check: ${checkDisplay}? [y/N] `);
  const normalized = answer.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}

async function finishDriveGoal(configRoot: string, checkDisplay: string, result: LoopRunResult): Promise<void> {
  if (result.status === "passed") {
    await completeGoalState(configRoot, `Drive check passed: ${checkDisplay}`);
    return;
  }
  await recordGoalEvidence(configRoot, `Drive ${result.status}: ${checkDisplay}`);
}

function formatDriveResult(result: LoopRunResult): string {
  const color = result.status === "passed" ? ansi.green : result.status === "failed" ? ansi.red : ansi.yellow;
  return `${paint(`drive ${result.status}:`, color)} ${result.turns} turn${result.turns === 1 ? "" : "s"} · ${latestEvaluatorSummary(result)}\n`;
}

function latestEvaluatorSummary(result: LoopRunResult): string {
  const latest = result.evaluations.at(-1);
  if (latest === undefined) {
    return "no check completed";
  }
  const executable = basename(latest.command);
  const code = latest.exitCode ?? "signal";
  return `${executable} exit ${code}`;
}

function parseTurns(value: string): number {
  const match = /(?:^|\s)--turns\s+(\d+)(?=\s|$)/u.exec(value);
  const raw = match?.[1];
  if (raw === undefined) {
    return defaultDriveTurns;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? Math.min(20, Math.max(1, parsed)) : defaultDriveTurns;
}

function stripTurns(value: string): string {
  return value.replace(/(?:^|\s)--turns\s+\d+(?=\s|$)/u, " ").replace(/\s+/gu, " ");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 48) || "goal";
}

function assertNever(value: never): never {
  throw new Error(`Unexpected drive args: ${String(value)}`);
}
