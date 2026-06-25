import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { request } from "undici";
import { z } from "zod";

import { DREAM_VERSION } from "./constants.js";

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

class UpdateCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpdateCommandError";
  }
}

const githubReleaseSchema = z.object({
  tag_name: z.string().min(1),
  assets: z.array(z.object({
    name: z.string(),
    browser_download_url: z.string().url(),
  })),
});

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

type LatestRelease = {
  readonly version: string;
  readonly assetUrl?: string;
};

async function latestRelease(env: NodeJS.ProcessEnv): Promise<LatestRelease> {
  const envVersion = env["DREAM_UPDATE_LATEST_VERSION"];
  if (envVersion !== undefined && envVersion.trim().length > 0) {
    const assetUrl = env["DREAM_UPDATE_ASSET_URL"];
    return {
      version: normalizeVersionTag(envVersion),
      ...(assetUrl === undefined || assetUrl.trim().length === 0 ? {} : { assetUrl }),
    };
  }

  const repository = env["DREAM_CODE_GITHUB_REPOSITORY"] ?? "parkjangwon/dream-code";
  const response = await request(`https://api.github.com/repos/${repository}/releases/latest`, {
    method: "GET",
    headers: { "user-agent": "Dream Code updater" },
    headersTimeout: 5_000,
    bodyTimeout: 8_000,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new UpdateCommandError(`update check failed: GitHub returned HTTP ${response.statusCode}`);
  }
  const parsed = githubReleaseSchema.safeParse(JSON.parse(await response.body.text()));
  if (!parsed.success) {
    throw new UpdateCommandError("update check failed: latest release response was invalid");
  }
  return {
    version: normalizeVersionTag(parsed.data.tag_name),
    ...assetUrlForRelease(parsed.data.assets),
  };
}

function assetUrlForRelease(
  assets: readonly { readonly name: string; readonly browser_download_url: string }[],
): { readonly assetUrl?: string } {
  const asset = assets.find((candidate) => /^dream-code-[0-9][^/]*\.tgz$/u.test(candidate.name));
  return asset === undefined ? {} : { assetUrl: asset.browser_download_url };
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

function normalizeVersionTag(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function versionParts(value: string): readonly number[] {
  return normalizeVersionTag(value)
    .slice(1)
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}
