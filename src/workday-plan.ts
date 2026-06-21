import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";

import { ansi, paint } from "./ansi.js";
import type { DreamConfig, PermissionMode } from "./config.js";
import { resolveEffectivePermissionMode } from "./config.js";
import { detectDiagnosticCommands } from "./lsp-check.js";
import { permissionModeText } from "./tui-render.js";

const packageJsonSchema = z.object({
  version: z.string().min(1),
  scripts: z.record(z.string(), z.string()).default({}),
});

export type WorkdayPlanSectionId = "mode" | "git" | "diagnostics" | "tests" | "release" | "next";

export type WorkdayPlanSection = {
  readonly id: WorkdayPlanSectionId;
  readonly label: string;
  readonly status: string;
  readonly detail: string;
  readonly command?: string | undefined;
};

export type WorkdayPlan = {
  readonly title: "Dream Workday";
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly mode: PermissionMode;
  readonly sections: readonly WorkdayPlanSection[];
};

export type WorkdayPlanOptions = {
  readonly cwd: string;
  readonly config: DreamConfig;
  readonly oneShotYolo: boolean;
  readonly dryRun: boolean;
};

export async function createWorkdayPlan(options: WorkdayPlanOptions): Promise<WorkdayPlan> {
  const [packageInfo, diagnosticCommands, gitInfo] = await Promise.all([
    readPackageInfo(options.cwd),
    detectDiagnosticCommands(options.cwd),
    readGitInfo(options.cwd),
  ]);
  const mode = resolveEffectivePermissionMode(options.config, options.oneShotYolo);
  const testCommand = commandForScript(packageInfo.scripts, "test") ?? commandForScript(packageInfo.scripts, "check");
  const diagnosticsCommand = diagnosticCommands[0]?.display;
  const releaseTag = currentReleaseTag(packageInfo.version);
  const tagName = releaseTagName(packageInfo.version);
  const nextPatch = nextPatchTag(packageInfo.version);

  return {
    title: "Dream Workday",
    cwd: options.cwd,
    dryRun: options.dryRun,
    mode,
    sections: [
      {
        id: "mode",
        label: "Mode",
        status: permissionModeText(mode, options.oneShotYolo),
        detail: mode === "yolo" ? "Fast autonomous edits are enabled; review diffs before release." : "Approval prompts stay visible for risky actions.",
      },
      {
        id: "git",
        label: "Git",
        status: gitInfo.status,
        detail: gitInfo.detail,
        command: "git status -sb",
      },
      {
        id: "diagnostics",
        label: "Diagnostics",
        status: diagnosticsCommand === undefined ? "not detected" : "ready",
        detail: diagnosticsCommand === undefined ? "No supported project diagnostics were found." : diagnosticsCommand,
        command: diagnosticsCommand,
      },
      {
        id: "tests",
        label: "Tests",
        status: testCommand === undefined ? "not detected" : "ready",
        detail: testCommand === undefined ? "No package test/check script was found." : testCommand,
        command: testCommand,
      },
      {
        id: "release",
        label: "Release",
        status: releaseTag,
        detail: `Run tests, pack the tarball, tag ${tagName}, then continue with ${nextPatch}.`,
        command: "npm test && npm pack --dry-run",
      },
      {
        id: "next",
        label: "Next",
        status: "work loop",
        detail: "Inspect diff, run diagnostics, run tests, summarize risk, then prepare the release.",
        command: "git diff --stat",
      },
    ],
  };
}

export function formatWorkdayPlan(plan: WorkdayPlan): string {
  return [
    paint(plan.title, `${ansi.bold}${ansi.accent}`),
    `${paint("cwd", ansi.muted)} ${plan.cwd}`,
    `${paint("dry run", ansi.muted)} ${plan.dryRun ? "yes" : "no"}`,
    "",
    ...plan.sections.flatMap((section) => [
      `${paint(section.label, ansi.blue)} ${formatSectionStatus(plan, section)}`,
      `  ${section.detail}`,
      ...(section.command === undefined ? [] : [`  ${paint("$", ansi.guide)} ${section.command}`]),
    ]),
  ].join("\n");
}

function formatSectionStatus(plan: WorkdayPlan, section: WorkdayPlanSection): string {
  return section.id === "mode" && plan.mode === "yolo" ? paint(section.status, ansi.red) : section.status;
}

async function readPackageInfo(cwd: string): Promise<z.infer<typeof packageJsonSchema>> {
  try {
    return packageJsonSchema.parse(JSON.parse(await readFile(join(cwd, "package.json"), "utf8")));
  } catch (error) {
    if (error instanceof Error) {
      return { version: "0.0.0", scripts: {} };
    }
    throw error;
  }
}

function commandForScript(scripts: Readonly<Record<string, string>>, scriptName: string): string | undefined {
  return scripts[scriptName] === undefined ? undefined : `npm run ${scriptName}`;
}

type GitInfo = {
  readonly status: string;
  readonly detail: string;
};

async function readGitInfo(cwd: string): Promise<GitInfo> {
  const inside = await runCommand("git", ["rev-parse", "--is-inside-work-tree"], cwd);
  if (!inside.ok || inside.output.trim() !== "true") {
    return { status: "not a repository", detail: "Git workflows are unavailable in this directory." };
  }

  const [branch, status] = await Promise.all([
    runCommand("git", ["branch", "--show-current"], cwd),
    runCommand("git", ["status", "--short"], cwd),
  ]);
  const branchName = branch.output.trim() || "detached";
  const changedCount = status.output.length === 0 ? 0 : status.output.split("\n").filter((line) => line.trim().length > 0).length;
  return {
    status: `${branchName} · ${changedCount === 0 ? "clean" : `${changedCount} changed`}`,
    detail: changedCount === 0 ? "Working tree is clean." : "Review the working tree before committing or tagging.",
  };
}

type CommandResult = {
  readonly ok: boolean;
  readonly output: string;
};

function runCommand(command: string, args: readonly string[], cwd: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", (error) => resolve({ ok: false, output: error.message }));
    child.on("close", (code) => resolve({ ok: code === 0, output: output.trim() }));
  });
}

function nextPatchTag(version: string): string {
  const parsed = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version);
  if (parsed === null) {
    return `next after ${version}`;
  }
  const major = parsed[1];
  const minor = parsed[2];
  const patch = Number(parsed[3]) + 1;
  return `next v${major}.${minor}.${patch}`;
}

function currentReleaseTag(version: string): string {
  return `current ${releaseTagName(version)}`;
}

function releaseTagName(version: string): string {
  return version.startsWith("v") ? version : `v${version}`;
}
