#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const testDir = join("dist", "test");
const quickNamePatterns = [
  /^ansi\.test\.js$/u,
  /^ci-release-workflow\.test\.js$/u,
  /^cli-args\.test\.js$/u,
  /^config-toml\.test\.js$/u,
  /^diff-risk\.test\.js$/u,
  /^llm-provider\.test\.js$/u,
  /^model-(?:availability-routing|catalog|routing)\.test\.js$/u,
  /^permission-preview\.test\.js$/u,
  /^provider-(?:matrix-contract|registry)\.test\.js$/u,
  /^redaction-policy\.test\.js$/u,
  /^remote-web\.test\.js$/u,
  /^route-preview-cli\.test\.js$/u,
  /^runtime-language\.test\.js$/u,
  /^shell-command\.test\.js$/u,
  /^status-dashboard\.test\.js$/u,
  /^steering-input-state\.test\.js$/u,
  /^swarm-(?:monitor-render|monitor-window|output|plan|scheduler|synthesis)\.test\.js$/u,
  /^terminal-title\.test\.js$/u,
  /^tui-(?:code-highlight|input-state|input-viewport|interrupt|markdown-table|picker-state|picker|provider-status|render|running-input-render|shortcuts)\.test\.js$/u,
];

const quickTests = readdirSync(testDir)
  .filter((name) => quickNamePatterns.some((pattern) => pattern.test(name)))
  .sort()
  .map((name) => join(testDir, name));

if (quickTests.length === 0) {
  console.error("No quick tests matched the automatic selection rules.");
  process.exit(1);
}

const child = spawn(process.execPath, ["--test", "--test-concurrency=4", ...quickTests], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
