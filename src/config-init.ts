import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { defaultConfigRoot, loadConfig, saveConfig } from "./config.js";
import { loadCredentials, saveCredentials } from "./credentials.js";

export type DreamHomeInitResult = {
  readonly root: string;
};

const initialDirectories = [
  "artifacts",
  "compacts",
  join("cron", "runs"),
  "exports",
  "plugins",
  "sessions",
  "skills",
  join("workflows", "runs"),
] as const;

export async function initializeDreamHome(root = defaultConfigRoot()): Promise<DreamHomeInitResult> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await saveConfig(root, await loadConfig(root));
  await saveCredentials(root, await loadCredentials(root));
  await Promise.all(initialDirectories.map((directory) => mkdir(join(root, directory), { recursive: true, mode: 0o700 })));
  return { root };
}
