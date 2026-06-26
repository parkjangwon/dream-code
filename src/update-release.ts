import { request } from "undici";
import { z } from "zod";

import { UpdateCommandError } from "./update-command-error.js";

const githubReleaseSchema = z.object({
  tag_name: z.string().min(1),
  assets: z.array(z.object({
    name: z.string(),
    browser_download_url: z.string().url(),
  })),
});

export type LatestRelease = {
  readonly version: string;
  readonly assetUrl?: string;
};

export async function latestRelease(env: NodeJS.ProcessEnv): Promise<LatestRelease> {
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

export function compareVersions(left: string, right: string): number {
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

function assetUrlForRelease(
  assets: readonly { readonly name: string; readonly browser_download_url: string }[],
): { readonly assetUrl?: string } {
  const asset = assets.find((candidate) => /^dream-code-[0-9][^/]*\.tgz$/u.test(candidate.name));
  return asset === undefined ? {} : { assetUrl: asset.browser_download_url };
}

function normalizeVersionTag(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function versionParts(value: string): readonly number[] {
  return normalizeVersionTag(value)
    .slice(1)
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}
