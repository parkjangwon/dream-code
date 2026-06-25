import assert from "node:assert/strict";
import test from "node:test";

import { formatUpdateReport, runUpdateCommand } from "../src/update-command.js";

test("runUpdateCommand reports available updates without installing in check mode", async () => {
  const calls: { readonly command: string; readonly args: readonly string[] }[] = [];
  const report = await runUpdateCommand({
    args: ["--check"],
    currentVersion: "0.1.25",
    env: { DREAM_UPDATE_LATEST_VERSION: "v0.1.26" },
    platform: "linux",
    runProcess: async (command, args) => {
      calls.push({ command, args });
      return { code: 0 };
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.currentVersion, "0.1.25");
  assert.equal(report.latestVersion, "v0.1.26");
  assert.equal(report.updateAvailable, true);
  assert.equal(report.action, "checked");
  assert.deepEqual(calls, []);
});

test("runUpdateCommand runs the bundled installer when an update is available", async () => {
  const calls: { readonly command: string; readonly args: readonly string[]; readonly env: NodeJS.ProcessEnv }[] = [];
  const report = await runUpdateCommand({
    args: [],
    currentVersion: "0.1.25",
    env: {
      DREAM_UPDATE_LATEST_VERSION: "v0.1.26",
      DREAM_UPDATE_INSTALLER: "/tmp/install.sh",
    },
    platform: "linux",
    runProcess: async (command, args, env) => {
      calls.push({ command, args, env });
      return { code: 0 };
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.action, "updated");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.args, ["/tmp/install.sh"]);
  assert.equal(calls[0]?.env["DREAM_CODE_VERSION"], "v0.1.26");
});

test("formatUpdateReport explains no-op updates", async () => {
  const report = await runUpdateCommand({
    args: ["--check"],
    currentVersion: "0.1.26",
    env: { DREAM_UPDATE_LATEST_VERSION: "v0.1.26" },
    platform: "linux",
  });

  assert.match(formatUpdateReport(report), /already up to date/u);
});
