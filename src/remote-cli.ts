import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

import { defaultConfigRoot } from "./config.js";
import { RemoteCliError } from "./remote-cli-error.js";
import {
  readRemoteReady,
  remoteRuntimeDir,
  removeRuntimeFiles,
  removeRuntimeFilesSync,
  type RemoteReady,
  stopTailscaleServeSync,
  waitForReady,
  writeReady,
} from "./remote-cli-runtime.js";
import { findRemoteDaemonPids, isProcessAlive, terminateRemoteDaemonPids } from "./remote-daemon-process.js";
import { formatRemoteAudit, revokeRemoteDeviceById } from "./remote-cli-audit.js";
import { startRemoteServer } from "./remote-server.js";
import { checkTailscaleRunning, remoteTailscaleUrl, startTailscaleServe, stopTailscaleServe } from "./remote-tailscale.js";

export { RemoteCliError } from "./remote-cli-error.js";

export type RemoteCommand = "start" | "serve" | "daemon" | "stop" | "status" | "audit" | "revoke" | "help";

export type RemoteCliOptions = {
  readonly command: RemoteCommand;
  readonly bindHost: string;
  readonly port: number;
  readonly unsafeAllowNonTailscale: boolean;
  readonly rest: readonly string[];
};

export type RemoteBindValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export function parseRemoteArgs(args: readonly string[]): RemoteCliOptions {
  const command = parseCommand(args[0] ?? "start");
  let bindHost = "127.0.0.1";
  let port = 9999;
  let unsafeAllowNonTailscale = false;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--bind" && next !== undefined) {
      bindHost = next;
      index += 1;
    } else if (arg === "--port" && next !== undefined) {
      port = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--unsafe-allow-non-tailscale") {
      unsafeAllowNonTailscale = true;
    }
  }

  return { command, bindHost, port, unsafeAllowNonTailscale, rest: args.slice(1) };
}

export function validateRemoteBind(bindHost: string, unsafeAllowNonTailscale: boolean): RemoteBindValidation {
  if (unsafeAllowNonTailscale || bindHost === "127.0.0.1" || bindHost === "::1") {
    return { ok: true };
  }
  return { ok: false, message: "Remote control listens on localhost; expose it with Tailscale Serve instead of binding a network interface." };
}

export async function runCliRemoteCommand(args: readonly string[], root = defaultConfigRoot()): Promise<void> {
  const options = parseRemoteArgs(args);
  switch (options.command) {
    case "start":
      await startRemoteDaemon(root, options);
      return;
    case "serve":
    case "daemon": {
      if (!options.unsafeAllowNonTailscale) {
        const tailscale = await checkTailscaleRunning();
        if (!tailscale.ok) {
          throw new RemoteCliError(tailscale.message);
        }
      }
      await runRemoteDaemon(root, options);
      return;
    }
    case "stop":
      await stopRemoteDaemon(root, options.port);
      return;
    case "status":
      await printRemoteStatus(root);
      return;
    case "audit":
      process.stdout.write(await formatRemoteAudit(root, args.includes("--json")));
      return;
    case "revoke":
      process.stdout.write(await revokeRemoteDeviceById(root, options.rest.find((arg) => !arg.startsWith("--")) ?? "", args.includes("--json")));
      return;
    case "help":
      console.log("Usage: dream remote start|stop|status|audit|revoke [--port 9999]");
      return;
    default:
      return assertNever(options.command);
  }
}

async function exposeWithTailscale(port: number, origin: string): Promise<string> {
  const scheme = await startTailscaleServe({ port, origin });
  return await remoteTailscaleUrl(port, scheme);
}

async function startRemoteDaemon(root: string, options: RemoteCliOptions): Promise<void> {
  const tailscale = await checkTailscaleRunning();
  if (!tailscale.ok) {
    throw new RemoteCliError(tailscale.message);
  }
  await mkdir(remoteRuntimeDir(root), { recursive: true, mode: 0o700 });
  const current = await readRemoteReady(root);
  if (current !== undefined && isProcessAlive(current.pid)) {
    printReady(current);
    return;
  }
  await removeRuntimeFiles(root);
  await terminateRemoteDaemonPids(await findRemoteDaemonPids(options.port));
  const child = spawn(process.execPath, [process.argv[1] ?? "", "remote", "daemon", "--port", String(options.port)], {
    detached: true,
    env: { ...process.env, DREAM_CODE_HOME: root, DREAM_REMOTE_WORKSPACE: process.cwd() },
    stdio: "ignore",
  });
  child.unref();
  const ready = await waitForReady(root);
  printReady(ready);
}

async function runRemoteDaemon(root: string, options: RemoteCliOptions): Promise<void> {
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: options.bindHost,
    port: options.port,
    unsafeAllowNonTailscale: options.unsafeAllowNonTailscale,
    workspaceRoot: process.env["DREAM_REMOTE_WORKSPACE"] ?? process.cwd(),
  });
  const remoteUrl = options.unsafeAllowNonTailscale ? server.origin : await exposeWithTailscale(server.port, server.origin);
  const ready = { pid: process.pid, port: server.port, url: remoteUrl, pairingCode: server.pairingCode };
  await writeReady(root, ready);
  let cleanupDone = false;
  const shutdown = async (): Promise<void> => {
    await server.close();
    if (!options.unsafeAllowNonTailscale) {
      await stopTailscaleServe(server.port);
    }
    await removeRuntimeFiles(root);
    cleanupDone = true;
  };
  process.once("exit", () => {
    if (!cleanupDone && !options.unsafeAllowNonTailscale) {
      stopTailscaleServeSync(server.port);
      removeRuntimeFilesSync(root);
    }
  });
  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
  await once(process, "SIGHUP");
  await shutdown();
}

async function stopRemoteDaemon(root: string, port: number): Promise<void> {
  const ready = await readRemoteReady(root);
  const portToStop = ready?.port ?? port;
  const pids = [
    ...(ready === undefined ? [] : [ready.pid]),
    ...(await findRemoteDaemonPids(portToStop)),
  ];
  await terminateRemoteDaemonPids(pids);
  await stopTailscaleServe(portToStop);
  await removeRuntimeFiles(root);
  console.log("Dream Remote stopped.");
}

async function printRemoteStatus(root: string): Promise<void> {
  const ready = await readRemoteReady(root);
  if (ready === undefined || !isProcessAlive(ready.pid)) {
    console.log("Dream Remote is stopped.");
    return;
  }
  printReady(ready);
}

function printReady(ready: RemoteReady): void {
  console.log("Dream Remote is ready.");
  console.log(`open: ${ready.url}`);
  console.log(`pairing code: ${ready.pairingCode}`);
}

function parseCommand(value: string): RemoteCommand {
  switch (value) {
    case "start":
    case "serve":
    case "daemon":
    case "stop":
    case "status":
    case "audit":
    case "revoke":
    case "help":
      return value;
    default:
      return "help";
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected remote command: ${String(value)}`);
}
