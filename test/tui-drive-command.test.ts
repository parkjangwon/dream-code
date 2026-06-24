import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { defaultConfig } from "../src/config.js";
import { loadGoalState } from "../src/goal-state.js";
import { remoteSlashCommands } from "../src/remote-slash-commands.js";
import { slashCommands } from "../src/tui-commands.js";
import { runDriveCommand } from "../src/tui-drive-command.js";

test("drive command prints usage when no objective is provided", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-drive-empty-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-drive-empty-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await runDriveCommand({
      config: defaultConfig(),
      configRoot: root,
      command: "/drive",
      rest: "",
      questioner: { question: async () => "" },
      cwd: project,
      oneShotYolo: true,
      runAgent: async () => {
        throw new Error("drive should not run an agent without an objective");
      },
    });

    assert.match(stripAnsi(chunks.join("")), /usage: \/drive <objective>/u);
    assert.equal(await loadGoalState(root), undefined);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("drive command runs a check-backed drive loop and completes the goal when it passes", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-drive-loop-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-drive-loop-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await writeFile(join(project, "check.mjs"), [
      "import { existsSync } from 'node:fs';",
      "process.exit(existsSync('marker.txt') ? 0 : 1);",
    ].join("\n"), "utf8");

    await runDriveCommand({
      config: defaultConfig(),
      configRoot: root,
      command: "/drive",
      rest: `Ship marker --turns 3 --check ${process.execPath} check.mjs`,
      questioner: { question: async () => "" },
      cwd: project,
      oneShotYolo: true,
      runAgent: async ({ turn }) => {
        if (turn === 2) {
          await writeFile(join(project, "marker.txt"), "ok", "utf8");
        }
        return `drive turn ${turn}`;
      },
    });

    const output = stripAnsi(chunks.join(""));
    const goal = await loadGoalState(root);
    const runFiles = await readdir(join(root, "loops", "runs"));
    const runRecord = JSON.parse(await readFile(join(root, "loops", "runs", runFiles[0] ?? ""), "utf8"));
    const tasks = await readFile(join(root, "tasks.md"), "utf8");
    const goals = await readFile(join(root, "goals.md"), "utf8");
    assert.match(output, /Drive/u);
    assert.match(output, /drive passed/u);
    assert.equal(goal?.status, "complete");
    assert.equal(runRecord.status, "passed");
    assert.equal(runRecord.turns, 2);
    assert.match(tasks, /Drive: Ship marker/u);
    assert.match(goals, /Ship marker/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("drive command is exposed in local and remote slash command registries", () => {
  assert.equal(slashCommands.find((command) => command.name === "/drive")?.summary, "Drive coding work to verified completion");
  assert.equal(remoteSlashCommands.some((command) => command.name === "/drive"), true);
});
