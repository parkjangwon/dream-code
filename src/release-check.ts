import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

import type { DreamConfig } from "./config.js";
import { runSmoke, type SmokeCheckStatus } from "./smoke.js";

const execFileAsync = promisify(execFile);

const packEntrySchema = z.object({
  files: z.array(z.object({ path: z.string() })).default([]),
});
const packOutputSchema = z.array(packEntrySchema);

export type ReleaseCheck = {
  readonly id: string;
  readonly label: string;
  readonly status: SmokeCheckStatus;
  readonly detail: string;
  readonly command: string;
  readonly repair: string;
};

export type ReleaseCheckReport = {
  readonly title: "Dream Release Check";
  readonly cwd: string;
  readonly ok: boolean;
  readonly checks: readonly ReleaseCheck[];
  readonly overall: {
    readonly status: SmokeCheckStatus;
    readonly next: string;
  };
};

export type ReleaseCheckOptions = {
  readonly cwd: string;
  readonly configRoot: string;
  readonly config: DreamConfig;
  readonly oneShotYolo: boolean;
  readonly env?: NodeJS.ProcessEnv;
};

export async function runReleaseCheck(options: ReleaseCheckOptions): Promise<ReleaseCheckReport> {
  const smoke = await runSmoke({
    cwd: options.cwd,
    configRoot: options.configRoot,
    config: options.config,
    oneShotYolo: options.oneShotYolo,
  });
  const checks = [
    smokeCheck(smoke.ok),
    await packCheck(options.cwd, options.env ?? process.env),
  ];
  const status = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "pass";
  return {
    title: "Dream Release Check",
    cwd: options.cwd,
    ok: status !== "fail",
    checks,
    overall: {
      status,
      next: status === "pass"
        ? "Ready to release after reviewer approval."
        : "Fix failed checks, rerun dream release-check, then release.",
    },
  };
}

export function formatReleaseCheckReport(report: ReleaseCheckReport): string {
  return [
    report.title,
    `cwd ${report.cwd}`,
    `status ${report.overall.status}`,
    "",
    ...report.checks.map((check) => [
      `${check.status} ${check.label} - ${check.detail}`,
      `  command: ${check.command}`,
      `  repair: ${check.repair}`,
    ].join("\n")),
    "",
    `next: ${report.overall.next}`,
  ].join("\n");
}

function smokeCheck(ok: boolean): ReleaseCheck {
  return {
    id: "smoke",
    label: "smoke",
    status: ok ? "pass" : "fail",
    detail: ok ? "production smoke checks passed" : "one or more smoke checks failed",
    command: "dream smoke --json",
    repair: ok ? "No action required." : "Run dream smoke --json and follow each failed check repair hint.",
  };
}

async function packCheck(cwd: string, env: NodeJS.ProcessEnv): Promise<ReleaseCheck> {
  const command = "npm pack --dry-run --ignore-scripts --json";
  if (env["DREAM_RELEASE_CHECK_SKIP_FULL"] === "1") {
    return {
      id: "pack",
      label: "npm pack",
      status: "pass",
      detail: "package dry-run skipped by DREAM_RELEASE_CHECK_SKIP_FULL",
      command,
      repair: "Unset DREAM_RELEASE_CHECK_SKIP_FULL before publishing a real release.",
    };
  }
  try {
    const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
      cwd,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      env,
    });
    const files = packOutputSchema.parse(JSON.parse(stdout)).flatMap((entry) => entry.files.map((file) => file.path));
    const missing = ["dist/src/cli.js", "dist/src/smoke.js"].filter((path) => !files.includes(path));
    return {
      id: "pack",
      label: "npm pack",
      status: missing.length === 0 ? "pass" : "fail",
      detail: missing.length === 0 ? `package contains ${files.length} files including runtime dist` : `package missing ${missing.join(", ")}`,
      command,
      repair: missing.length === 0 ? "No action required." : "Run npm run build and verify package.json files includes dist/src.",
    };
  } catch (error) {
    return {
      id: "pack",
      label: "npm pack",
      status: "fail",
      detail: error instanceof Error ? error.message : "npm pack failed",
      command,
      repair: "Run npm run build, inspect npm pack --dry-run --ignore-scripts --json, then fix packaging.",
    };
  }
}
