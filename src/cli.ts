#!/usr/bin/env node
import { DREAM_SIGNATURE, DREAM_VERSION } from "./constants.js";
import { initializeDreamHome } from "./config-init.js";
import { defaultConfigRoot, loadConfig } from "./config.js";
import { runDoctor, summarizeDoctor } from "./doctor.js";
import { createWorkdayPlan, formatWorkdayPlan } from "./workday-plan.js";

type CliCommand = "tui" | "cron" | "daemon" | "doctor" | "help" | "init" | "version" | "workday";

type ParsedArgs = {
  readonly command: CliCommand;
  readonly oneShotYolo: boolean;
  readonly rest: readonly string[];
};

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

async function runCronCommand(rest: readonly string[]): Promise<void> {
  const { runCliCronCommand } = await import("./cron-cli.js");
  await runCliCronCommand(rest);
}

async function runDaemonCommand(rest: readonly string[]): Promise<void> {
  const { runCliDaemonCommand } = await import("./cron-cli.js");
  await runCliDaemonCommand(rest);
}

function parseArgs(args: readonly string[]): ParsedArgs {
  let command: CliCommand = "tui";
  let oneShotYolo = false;
  const rest: string[] = [];

  for (const [index, arg] of args.entries()) {
    switch (arg) {
      case "--yolo":
        oneShotYolo = true;
        break;
      case "doctor":
        command = "doctor";
        break;
      case "workday":
        command = "workday";
        rest.push(...args.slice(index + 1));
        return { command, oneShotYolo, rest };
      case "cron":
        command = "cron";
        rest.push(...args.slice(index + 1));
        return { command, oneShotYolo, rest };
      case "daemon":
        command = "daemon";
        rest.push(...args.slice(index + 1));
        return { command, oneShotYolo, rest };
      case "init":
        command = "init";
        break;
      case "--help":
      case "-h":
        command = "help";
        break;
      case "--version":
      case "-v":
        command = "version";
        break;
      default:
        command = "help";
        break;
    }
  }

  return { command, oneShotYolo, rest };
}

function printHelp(): void {
  console.log([
    "Dream Code",
    DREAM_SIGNATURE,
    "",
    "Usage:",
    "  dream             open the TUI",
    "  dream --yolo      open the TUI with one-shot unconditional bypass",
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
