#!/usr/bin/env node
import { DREAM_SIGNATURE, DREAM_VERSION } from "./constants.js";
import { initializeDreamHome } from "./config-init.js";
import { defaultConfigRoot, loadConfig } from "./config.js";
import { parseArgs } from "./cli-args.js";
import { cliStartCache } from "./cli-start-cache.js";
import { runDoctor, summarizeDoctor } from "./doctor.js";
import { createWorkdayPlan, formatWorkdayPlan } from "./workday-plan.js";

async function main(): Promise<void> {
  const parsedArgs = parseArgs(process.argv.slice(2));

  switch (parsedArgs.command) {
    case "tui":
      await runTuiCommand(parsedArgs.oneShotYolo);
      return;
    case "cron":
      await runCronCommand(parsedArgs.rest);
      return;
    case "daemon":
      await runDaemonCommand(parsedArgs.rest);
      return;
    case "prompt":
      await runPromptMode({
        prompt: parsedArgs.prompt ?? "",
        oneShotYolo: parsedArgs.oneShotYolo,
        json: parsedArgs.json,
        quiet: parsedArgs.quiet,
      });
      return;
    case "doctor":
      console.log(summarizeDoctor(await runDoctor()));
      return;
    case "workday": {
      const config = await loadConfig(defaultConfigRoot());
      const plan = await createWorkdayPlan({
        cwd: process.cwd(),
        config,
        oneShotYolo: parsedArgs.oneShotYolo,
        dryRun: parsedArgs.rest.includes("--dry-run"),
      });
      console.log(parsedArgs.rest.includes("--json") ? JSON.stringify(plan, undefined, 2) : formatWorkdayPlan(plan));
      return;
    }
    case "help":
      printHelp();
      return;
    case "init": {
      const result = await initializeDreamHome();
      console.log(`Dream Code initialized: ${result.root}`);
      return;
    }
    case "version":
      console.log(DREAM_VERSION);
      return;
    default:
      return assertNever(parsedArgs.command);
  }
}

async function runTuiCommand(oneShotYolo: boolean): Promise<void> {
  const { runTui } = await import("./tui.js");
  await runTui({ oneShotYolo });
}

async function runPromptMode(options: {
  readonly prompt: string;
  readonly oneShotYolo: boolean;
  readonly json: boolean;
  readonly quiet: boolean;
}): Promise<void> {
  const configRoot = defaultConfigRoot();
  const start = await cliStartCache.get(configRoot);
  const { runPromptCommand } = await import("./cli-prompt.js");
  const { createLlmDreamingSummarizer } = await import("./dreaming-summarizer.js");
  const config = options.oneShotYolo ? { ...start.config, permissions: { mode: "yolo" as const } } : start.config;
  await runPromptCommand({
    config,
    configRoot: start.root,
    prompt: options.prompt,
    json: options.json,
    quiet: options.quiet,
    summarizer: createLlmDreamingSummarizer(config, start.root),
    write: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}

async function runCronCommand(rest: readonly string[]): Promise<void> {
  const { runCliCronCommand } = await import("./cron-cli.js");
  await runCliCronCommand(rest);
}

async function runDaemonCommand(rest: readonly string[]): Promise<void> {
  const { runCliDaemonCommand } = await import("./cron-cli.js");
  await runCliDaemonCommand(rest);
}

function printHelp(): void {
  console.log([
    "Dream Code",
    DREAM_SIGNATURE,
    "",
    "Usage:",
    "  dream             open the TUI",
    "  dream --yolo      open the TUI with one-shot unconditional bypass",
    "  dream -p \"prompt\" run one prompt non-interactively",
    "  dream -p \"prompt\" --json --quiet  script-friendly prompt mode",
    "  dream cron list   list scheduled agent jobs",
    "  dream daemon run-once  execute due cron jobs once",
    "  dream doctor      check local tool availability",
    "  dream workday --dry-run  show the edit-test-review release loop",
    "  dream init        initialize ~/.dream files",
    "  dream --version   print the version",
  ].join("\n"));
}

function assertNever(value: never): never {
  throw new Error(`Unexpected CLI command: ${String(value)}`);
}

// no-excuse-ok: catch
main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Unknown Dream Code failure");
  }
  process.exitCode = 1;
});
