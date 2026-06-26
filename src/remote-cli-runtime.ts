import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { RemoteCliError } from "./remote-cli-error.js";

export type RemoteReady = {
  readonly pid: number;
  readonly port: number;
  readonly url: string;
  readonly pairingCode: string;
};

export function remoteRuntimeDir(root: string): string {
  return join(root, "webapp");
}

export async function writeReady(root: string, ready: RemoteReady): Promise<void> {
  await mkdir(remoteRuntimeDir(root), { recursive: true, mode: 0o700 });
  await writeFile(remoteReadyPath(root), `${JSON.stringify(ready, null, 2)}\n`, "utf8");
}

export async function readRemoteReady(root: string): Promise<RemoteReady | undefined> {
  try {
    return JSON.parse(await readFile(remoteReadyPath(root), "utf8")) as RemoteReady;
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return undefined;
    }
    throw error;
  }
}

export async function waitForReady(root: string): Promise<RemoteReady> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const ready = await readRemoteReady(root);
    if (ready !== undefined) {
      return ready;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new RemoteCliError("Dream Remote daemon did not become ready.");
}

export async function removeRuntimeFiles(root: string): Promise<void> {
  await rm(remoteReadyPath(root), { force: true });
}

export function removeRuntimeFilesSync(root: string): void {
  rmSync(remoteReadyPath(root), { force: true });
}

export function stopTailscaleServeSync(port: number): void {
  spawnSync("tailscale", ["serve", `--https=${port}`, "off"], { stdio: "ignore", timeout: 5_000 });
  spawnSync("tailscale", ["serve", `--http=${port}`, "off"], { stdio: "ignore", timeout: 5_000 });
}

function remoteReadyPath(root: string): string {
  return join(remoteRuntimeDir(root), "remote-ready.json");
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrno(error: unknown, code: string): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string" && error.code === code;
}
