import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { stdout as output } from "node:process";
import { join, relative, resolve } from "node:path";

import { runAgentPrompt } from "./agent-runner.js";
import { ansi, paint, stripAnsi } from "./ansi.js";
import { resolveEffectivePermissionMode } from "./config.js";
import { runLoopSpec, type LoopAgentInput, type LoopAgentRunner, type LoopRunEvent } from "./loop-engine.js";
import { formatEvaluatorCommand, formatLoopPreview } from "./loop-preview.js";
import { saveLoopRun } from "./loop-runs.js";
import { LoopSpecParseError, parseLoopSpec, type LoopSpec } from "./loop-spec.js";
import { riskyShellReason } from "./shell-safety.js";
import type { UtilityCommandOptions } from "./tui-utility-commands.js";

export type LoopCommandOptions = UtilityCommandOptions & {
  readonly runAgent?: LoopAgentRunner;
};

export async function runLoopCommand(options: LoopCommandOptions): Promise<void> {
  const args = await loopCommandArgs(options);
  if (args.specPath.trim().length === 0) {
    return;
  }
  const filePath = resolve(options.cwd, args.specPath.trim());
  const raw = await readLoopSpec(filePath);
  if (raw === undefined) {
    output.write(`${paint("loop not found:", ansi.yellow)} ${paint(args.specPath.trim(), ansi.blue)}\n`);
    output.write(`${paint("usage:", ansi.dim)} /loop path/to/loop.json\n`);
    return;
  }

  try {
    const spec = parseLoopSpec(raw);
    if (args.dryRun) {
      output.write(formatLoopPreview(spec));
      return;
    }
    if (!(await confirmLoopRun(options, spec))) {
      output.write(`${paint("loop blocked:", ansi.yellow)} evaluator command was not approved\n`);
      return;
    }
    output.write(`${paint("Loop", `${ansi.bold}${ansi.accent}`)} ${paint(spec.name, ansi.blue)}\n`);
    output.write(`${paint("budget:", ansi.dim)} ${spec.maxTurns} agent turns + ${spec.maxTurns} evaluator runs\n`);
    const risk = riskyShellReason(formatEvaluatorCommand(spec));
    if (risk !== undefined) {
      output.write(`${paint("risk:", ansi.yellow)} ${risk}\n`);
    }
    const result = await runLoopSpec({
      workspace: options.cwd,
      spec,
      runAgent: options.runAgent ?? ((input) => runDefaultLoopAgent(options, input)),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const runPath = await saveLoopRun(options.configRoot, {
      specPath: filePath,
      workspace: options.cwd,
      spec,
      result,
    });
    output.write(formatLoopResult(result.status, result.turns, result.durationMs));
    output.write(formatLoopTrace(result.events));
    output.write(`${paint("loop run:", ansi.dim)} ${paint(runPath, ansi.blue)}\n`);
  } catch (error) {
    if (error instanceof LoopSpecParseError) {
      output.write(`${paint("loop spec invalid:", ansi.red)} ${error.reason}\n`);
      return;
    }
    throw error;
  }
}

type LoopCommandArgs = {
  readonly specPath: string;
  readonly dryRun: boolean;
};

async function loopCommandArgs(options: LoopCommandOptions): Promise<LoopCommandArgs> {
  if (options.rest.trim().length > 0) {
    const parts = options.rest.trim().split(/\s+/u);
    const dryRun = parts.includes("--dry-run");
    return { specPath: parts.filter((part) => part !== "--dry-run").join(" "), dryRun };
  }
  const choices = await loopChoices(options.cwd);
  if (choices.length > 0 && options.questioner.select !== undefined) {
    return { specPath: await options.questioner.select({ title: "Loops", choices }) ?? "", dryRun: false };
  }
  if (choices.length === 0) {
    const starterPath = await createStarterLoop(options.cwd);
    output.write(`${paint("loop starter created:", ansi.green)} ${paint(relative(options.cwd, starterPath), ansi.blue)}\n`);
    output.write(`${paint("edit it, then run:", ansi.dim)} /loop ${relative(options.cwd, starterPath)}\n`);
    return { specPath: "", dryRun: false };
  }
  return { specPath: await options.questioner.question("Loop spec: "), dryRun: false };
}

async function loopChoices(cwd: string): Promise<readonly { readonly value: string; readonly label: string; readonly description: string; readonly keywords: readonly string[] }[]> {
  const files = (await Promise.all([loopFiles(cwd, ".dream/loops"), loopFiles(cwd, "loops")])).flat();
  return Promise.all(files.map(async (filePath) => {
    const rel = relative(cwd, filePath);
    const spec = await readLoopSpecForChoice(filePath);
    return {
      value: rel,
      label: rel,
      description: spec === undefined ? "Project loop" : `${spec.name}: ${spec.goal}`,
      keywords: spec === undefined ? [filePath, rel] : [filePath, rel, spec.name, spec.goal],
    };
  }));
}

async function loopFiles(cwd: string, directory: string): Promise<readonly string[]> {
  const root = join(cwd, directory);
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(root, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function createStarterLoop(cwd: string): Promise<string> {
  const filePath = join(cwd, ".dream", "loops", "example.json");
  await mkdir(join(cwd, ".dream", "loops"), { recursive: true, mode: 0o700 });
  try {
    await writeFile(filePath, `${JSON.stringify(starterLoopSpec(), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (isErrnoException(error) && error.code === "EEXIST") {
      return filePath;
    }
    throw error;
  }
  return filePath;
}

function starterLoopSpec(): LoopSpec {
  return {
    version: 1,
    name: "test-ratchet",
    goal: "Make the project checks pass without weakening the checks.",
    prompt: "Inspect the failing check, make the smallest fix, and leave a short verification note.",
    maxTurns: 3,
    evaluator: {
      type: "command",
      command: "npm",
      args: ["test"],
      passExitCodes: [0],
      timeoutMs: 120_000,
    },
  };
}

async function confirmLoopRun(options: LoopCommandOptions, spec: LoopSpec): Promise<boolean> {
  const mode = resolveEffectivePermissionMode(options.config, options.oneShotYolo);
  if (mode === "yolo") {
    return true;
  }
  const answer = await options.questioner.question(`run loop evaluator: ${formatEvaluatorCommand(spec)}? [y/N] `);
  const normalized = answer.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}

async function runDefaultLoopAgent(options: LoopCommandOptions, input: LoopAgentInput): Promise<string> {
  let transcript = "";
  await runAgentPrompt({
    config: options.config,
    configRoot: options.configRoot,
    cwd: options.cwd,
    prompt: input.prompt,
    runLabel: `Loop ${input.spec.name} #${input.turn}`,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    write: (chunk) => {
      transcript = `${transcript}${stripAnsi(chunk)}`;
      output.write(chunk);
    },
  });
  return transcript.trim();
}

async function readLoopSpec(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function readLoopSpecForChoice(filePath: string): Promise<LoopSpec | undefined> {
  const raw = await readLoopSpec(filePath);
  if (raw === undefined) {
    return undefined;
  }
  try {
    return parseLoopSpec(raw);
  } catch (error) {
    if (error instanceof LoopSpecParseError) {
      return undefined;
    }
    throw error;
  }
}

function formatLoopResult(status: string, turns: number, durationMs: number): string {
  const color = status === "passed" ? ansi.green : status === "failed" ? ansi.red : ansi.yellow;
  return `${paint(`loop ${status}:`, color)} ${turns} turn${turns === 1 ? "" : "s"} · ${formatDuration(durationMs)}\n`;
}

function formatLoopTrace(events: readonly LoopRunEvent[]): string {
  const recent = events.filter((event) => event.status !== "started").slice(-8).map(formatLoopEvent);
  return [`${paint("loop trace:", ansi.dim)} ${recent.length} recent events`, ...recent, ""].join("\n");
}

function formatLoopEvent(event: LoopRunEvent): string {
  const status = event.status === "failed" ? paint("FAILED", ansi.red) : paint("DONE  ", ansi.green);
  return `${status} ${paint(event.type.padEnd(8), ansi.muted)} #${event.turn} ${paint(formatDuration(event.elapsedMs).padStart(7), ansi.dim)} ${event.summary}`;
}

function formatDuration(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
