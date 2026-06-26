import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DREAM_VERSION } from "./constants.js";
import { UpdateCommandError } from "./update-command-error.js";
import { compareVersions, latestRelease, type LatestRelease } from "./update-release.js";

export { UpdateCommandError } from "./update-command-error.js";

export type UpdateAction = "checked" | "failed" | "skipped" | "updated";

export type UpdateReport = {
  readonly title: "Dream Update";
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly updateAvailable: boolean;
  readonly action: UpdateAction;
  readonly ok: boolean;
  readonly detail: string;
  readonly command?: string;
};

export type ProcessResult = {
  readonly code: number;
};

export type ProcessRunner = (
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
) => Promise<ProcessResult>;

export type UpdateCommandOptions = {
  readonly args: readonly string[];
  readonly currentVersion?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly outputMode?: "inherit" | "stderr";
  readonly platform?: NodeJS.Platform;
  readonly runProcess?: ProcessRunner;
};

export async function runUpdateCommand(options: UpdateCommandOptions): Promise<UpdateReport> {
  const args = parseUpdateArgs(options.args);
  const env = options.env ?? process.env;
  const currentVersion = options.currentVersion ?? DREAM_VERSION;
  const latest = await latestRelease(env);
  const updateAvailable = args.force || compareVersions(latest.version, currentVersion) > 0;

  if (args.checkOnly) {
    return {
      title: "Dream Update",
      currentVersion,
      latestVersion: latest.version,
      updateAvailable,
      action: "checked",
      ok: true,
      detail: updateAvailable ? "update available" : "already up to date",
    };
  }

  if (!updateAvailable) {
    return {
      title: "Dream Update",
      currentVersion,
      latestVersion: latest.version,
      updateAvailable: false,
      action: "skipped",
      ok: true,
      detail: "already up to date",
    };
  }

  const install = await installCommand(options.platform ?? process.platform, env, latest);
  const runner = options.runProcess ?? ((command, args, env) => runChildProcess(command, args, env, options.outputMode ?? "inherit"));
  const result = await runner(install.command, install.args, install.env);
  const ok = result.code === 0;
  return {
    title: "Dream Update",
    currentVersion,
    latestVersion: latest.version,
    updateAvailable: true,
    action: ok ? "updated" : "failed",
    ok,
    detail: ok ? "updated to latest release" : `installer exited with code ${result.code}`,
    command: [install.command, ...install.args].join(" "),
  };
}

export function formatUpdateReport(report: UpdateReport): string {
  const lines = [
    report.title,
    `current: ${report.currentVersion}`,
    `latest:  ${report.latestVersion}`,
    `status:  ${report.detail}`,
  ];
  if (report.command !== undefined) {
    lines.push(`command: ${report.command}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseUpdateArgs(args: readonly string[]): { readonly checkOnly: boolean; readonly force: boolean } {
  return {
    checkOnly: args.includes("--check"),
    force: args.includes("--force"),
  };
}

type InstallCommand = {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
};

async function installCommand(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  latest: LatestRelease,
): Promise<InstallCommand> {
  if (platform === "win32") {
    if (latest.assetUrl === undefined) {
      throw new UpdateCommandError("Windows update requires a release tarball asset");
    }
    return {
      command: "npm",
      args: ["install", "-g", latest.assetUrl, "--ignore-scripts"],
      env: { ...process.env, ...env },
    };
  }
  const installer = await resolveInstallerPath(env);
  return {
    command: "sh",
    args: [installer],
    env: { ...process.env, ...env, DREAM_CODE_VERSION: latest.version },
  };
}

async function resolveInstallerPath(env: NodeJS.ProcessEnv): Promise<string> {
  const override = env["DREAM_UPDATE_INSTALLER"];
  if (override !== undefined && override.trim().length > 0) {
    return override;
  }
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDir, "../../install.sh"),
    resolve(moduleDir, "../../../install.sh"),
    resolve(process.cwd(), "install.sh"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch (error) {
      if (error instanceof Error) {
        continue;
      }
      throw error;
    }
  }
  throw new UpdateCommandError("Could not find install.sh; reinstall with the published installer");
}

function runChildProcess(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  outputMode: "inherit" | "stderr",
): Promise<ProcessResult> {
  return new Promise((resolveResult) => {
    const child = spawn(command, [...args], {
      env,
      stdio: outputMode === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    if (outputMode === "stderr") {
      child.stdout?.on("data", (chunk: Buffer) => {
        process.stderr.write(chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        process.stderr.write(chunk);
      });
    }
    child.on("close", (code) => {
      resolveResult({ code: code ?? 1 });
    });
  });
}
