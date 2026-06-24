import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs } from "../src/cli-args.js";
import { parseRemoteArgs, validateRemoteBind } from "../src/remote-cli.js";
import { findRemoteDaemonPids, remoteDaemonPidFromLine } from "../src/remote-daemon-process.js";
import { checkTailscaleRunning, remoteTailscaleUrl, startTailscaleServe, stopTailscaleServe } from "../src/remote-tailscale.js";

test("parseArgs routes remote commands to the remote daemon surface", () => {
  const parsed = parseArgs(["remote", "start"]);

  assert.equal(parsed.command, "remote");
  assert.deepEqual(parsed.rest, ["start"]);
});

test("parseRemoteArgs defaults the web app port to 9999", () => {
  const options = parseRemoteArgs(["start"]);

  assert.equal(options.command, "start");
  assert.equal(options.port, 9999);
  assert.equal(options.bindHost, "127.0.0.1");
});

test("parseRemoteArgs accepts a custom web app port", () => {
  const options = parseRemoteArgs(["start", "--port", "7777"]);

  assert.equal(options.port, 7777);
});

test("parseRemoteArgs accepts stop and daemon commands", () => {
  assert.equal(parseRemoteArgs(["stop"]).command, "stop");
  assert.equal(parseRemoteArgs(["daemon", "--port", "7777"]).command, "daemon");
  assert.equal(parseRemoteArgs(["daemon", "--port", "7777"]).port, 7777);
});

test("validateRemoteBind keeps the daemon localhost-only unless explicitly unsafe", () => {
  assert.equal(validateRemoteBind("127.0.0.1", false).ok, true);

  const rejected = validateRemoteBind("0.0.0.0", false);
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /localhost/u);
  assert.equal(validateRemoteBind("100.96.12.4", true).ok, true);
});

test("remote daemon process discovery matches only Dream Remote for the target port", async () => {
  const psOutput = [
    " 123 /usr/bin/node /repo/dist/src/cli.js remote daemon --port 9999",
    " 456 /usr/bin/node /repo/dist/src/cli.js remote daemon --port 7777",
    " 789 rg remote daemon --port 9999",
    " 790 /bin/zsh -c ps aux | rg 'dist/src/cli.js remote daemon --port 9999'",
  ].join("\n");

  assert.deepEqual(remoteDaemonPidFromLine(" 123 /usr/bin/node /repo/dist/src/cli.js remote daemon --port 9999", 9999), [123]);
  assert.deepEqual(remoteDaemonPidFromLine(" 790 /bin/zsh -c ps aux | rg 'dist/src/cli.js remote daemon --port 9999'", 9999), []);
  assert.deepEqual(await findRemoteDaemonPids(9999, async () => ({ stdout: psOutput })), [123]);
});

test("checkTailscaleRunning blocks remote start when Tailscale is stopped", async () => {
  const stopped = await checkTailscaleRunning(async () => ({ stdout: "{\"BackendState\":\"Stopped\"}" }));
  const running = await checkTailscaleRunning(async () => ({ stdout: "{\"BackendState\":\"Running\"}" }));

  assert.equal(stopped.ok, false);
  assert.match(stopped.message, /Start Tailscale/u);
  assert.equal(running.ok, true);
});

test("startTailscaleServe exposes the localhost remote daemon on the chosen port", async () => {
  const calls: { readonly command: string; readonly args: readonly string[] }[] = [];

  const scheme = await startTailscaleServe({
    port: 7777,
    origin: "http://127.0.0.1:7777",
    runCommand: async (command, args) => {
      calls.push({ command, args });
      return { stdout: "" };
    },
  });

  assert.equal(scheme, "https");
  assert.deepEqual(calls, [{
    command: "tailscale",
    args: ["serve", "--bg", "--https=7777", "http://127.0.0.1:7777"],
  }]);
});

test("startTailscaleServe falls back to HTTP when HTTPS Serve is unavailable", async () => {
  const calls: { readonly command: string; readonly args: readonly string[] }[] = [];

  const scheme = await startTailscaleServe({
    port: 7777,
    origin: "http://127.0.0.1:7777",
    runCommand: async (command, args) => {
      calls.push({ command, args });
      if (args.includes("--https=7777")) {
        throw new Error("Serve is not enabled on your tailnet.");
      }
      return { stdout: "" };
    },
  });

  assert.equal(scheme, "http");
  assert.deepEqual(calls, [
    {
      command: "tailscale",
      args: ["serve", "--bg", "--https=7777", "http://127.0.0.1:7777"],
    },
    {
      command: "tailscale",
      args: ["serve", "--bg", "--http=7777", "http://127.0.0.1:7777"],
    },
  ]);
});

test("remoteTailscaleUrl uses MagicDNS when Tailscale reports a device name", async () => {
  const url = await remoteTailscaleUrl(9999, "https", async () => ({
    stdout: "{\"BackendState\":\"Running\",\"Self\":{\"DNSName\":\"macbook-pro.tailnet.ts.net.\"}}",
  }));

  assert.equal(url, "https://macbook-pro.tailnet.ts.net:9999");
});

test("stopTailscaleServe disables HTTPS and stale HTTP handlers for the configured port", async () => {
  const calls: { readonly command: string; readonly args: readonly string[] }[] = [];

  await stopTailscaleServe(9999, async (command, args) => {
    calls.push({ command, args });
    return { stdout: "" };
  });

  assert.deepEqual(calls, [
    {
      command: "tailscale",
      args: ["serve", "--https=9999", "off"],
    },
    {
      command: "tailscale",
      args: ["serve", "--http=9999", "off"],
    },
  ]);
});

test("stopTailscaleServe ignores an already removed Tailscale Serve handler", async () => {
  await stopTailscaleServe(9999, async () => {
    throw new Error("failed to remove web serve: handler does not exist");
  });
});

test("stopTailscaleServe retries transient Tailscale Serve config races", async () => {
  let calls = 0;
  await stopTailscaleServe(9999, async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error("Another client is changing the serve config: etag mismatch");
    }
    return { stdout: "" };
  });

  assert.equal(calls, 3);
});
