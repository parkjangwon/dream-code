#!/usr/bin/env node
import { DREAM_SIGNATURE, DREAM_VERSION } from "./constants.js";
import { initializeDreamHome } from "./config-init.js";
import { defaultConfigRoot, loadConfig } from "./config.js";
import { parseArgs } from "./cli-args.js";
import { cliStartCache } from "./cli-start-cache.js";
import { runDoctor, summarizeDoctor } from "./doctor.js";
import { formatReleaseCheckReport, runReleaseCheck } from "./release-check.js";
import { formatSmokeReport, runSmoke } from "./smoke.js";
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
    case "remote":
      await runRemoteCommand(parsedArgs.rest);
      return;
    case "route":
      await runRouteCommand(parsedArgs.rest);
      return;
    case "runs":
      await runRunsCommand(parsedArgs.rest);
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
    case "eval": {
      const config = await loadConfig(defaultConfigRoot());
      const { runCodingAgentEval, formatCodingAgentEvalReport } = await import("./coding-agent-eval.js");
      const report = await runCodingAgentEval({
        cwd: process.cwd(),
        configRoot: defaultConfigRoot(),
        config,
      });
      console.log(parsedArgs.rest.includes("--json") ? JSON.stringify(report, undefined, 2) : formatCodingAgentEvalReport(report));
      process.exitCode = report.ok ? 0 : 1;
      return;
    }
    case "smoke": {
      const config = await loadConfig(defaultConfigRoot());
      const report = await runSmoke({
        cwd: process.cwd(),
        configRoot: defaultConfigRoot(),
        config,
        oneShotYolo: parsedArgs.oneShotYolo,
      });
      console.log(parsedArgs.rest.includes("--json") ? JSON.stringify(report, undefined, 2) : formatSmokeReport(report));
      process.exitCode = report.ok ? 0 : 1;
      return;
    }
    case "release-check": {
      const config = await loadConfig(defaultConfigRoot());
      const report = await runReleaseCheck({
        cwd: process.cwd(),
        configRoot: defaultConfigRoot(),
        config,
        oneShotYolo: parsedArgs.oneShotYolo,
      });
      console.log(parsedArgs.rest.includes("--json") ? JSON.stringify(report, undefined, 2) : formatReleaseCheckReport(report));
      process.exitCode = report.ok ? 0 : 1;
      return;
    }
    case "update": {
      const { runUpdateCommand, formatUpdateReport } = await import("./update-command.js");
      const report = await runUpdateCommand({
        args: parsedArgs.rest,
        outputMode: parsedArgs.rest.includes("--json") ? "stderr" : "inherit",
      });
      console.log(parsedArgs.rest.includes("--json") ? JSON.stringify(report, undefined, 2) : formatUpdateReport(report));
      process.exitCode = report.ok ? 0 : 1;
      return;
    }
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

async function runRemoteCommand(rest: readonly string[]): Promise<void> {
  const { runCliRemoteCommand } = await import("./remote-cli.js");
  await runCliRemoteCommand(rest);
}

async function runRouteCommand(rest: readonly string[]): Promise<void> {
  const { runProviderRouteCommand } = await import("./provider-routing-cli.js");
  await runProviderRouteCommand(rest);
}

async function runRunsCommand(rest: readonly string[]): Promise<void> {
  const { runRunsCommand: runWorkspaceRunsCommand } = await import("./tui-run-command.js");
  process.stdout.write(await runWorkspaceRunsCommand({
    configRoot: defaultConfigRoot(),
    rest: rest.join(" "),
    cwd: process.cwd(),
  }));
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
    "  dream remote start  start the Tailscale-only remote daemon on port 9999",
    "  dream route \"prompt\" --json  preview provider routing diagnostics",
    "  dream runs show latest --json  inspect the latest run audit record",
    "  dream doctor      check local tool availability",
    "  dream eval        run deterministic coding-agent quality checks",
    "  dream smoke       run local production-readiness smoke checks",
    "  dream release-check  run smoke and package readiness checks",
    "  dream update      update Dream Code to the latest GitHub Release",
    "  dream update --check  check whether a newer release exists",
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
