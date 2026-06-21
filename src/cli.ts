#!/usr/bin/env node
import { DREAM_SIGNATURE, DREAM_VERSION } from "./constants.js";
import { initializeDreamHome } from "./config-init.js";
import { runDoctor, summarizeDoctor } from "./doctor.js";
import { runTui } from "./tui.js";

type CliCommand = "tui" | "doctor" | "help" | "init" | "version";

type ParsedArgs = {
  readonly command: CliCommand;
  readonly oneShotYolo: boolean;
};

async function main(): Promise<void> {
  const parsedArgs = parseArgs(process.argv.slice(2));

  switch (parsedArgs.command) {
    case "tui":
      await runTui({ oneShotYolo: parsedArgs.oneShotYolo });
      return;
    case "doctor":
      console.log(summarizeDoctor(await runDoctor()));
      return;
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

function parseArgs(args: readonly string[]): ParsedArgs {
  let command: CliCommand = "tui";
  let oneShotYolo = false;

  for (const arg of args) {
    switch (arg) {
      case "--yolo":
        oneShotYolo = true;
        break;
      case "doctor":
        command = "doctor";
        break;
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

  return { command, oneShotYolo };
}

function printHelp(): void {
  console.log([
    "Dream Code",
    DREAM_SIGNATURE,
    "",
    "Usage:",
    "  dream             open the TUI",
    "  dream --yolo      open the TUI with one-shot unconditional bypass",
    "  dream doctor      check local tool availability",
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
