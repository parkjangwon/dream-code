import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { defaultConfig } from "../src/config.js";
import { runLoopCommand } from "../src/tui-loop-command.js";

test("loop command runs a saved loop spec and stores the run record", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-loop-command-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-loop-command-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const config = defaultConfig();
    config.permissions.mode = "ask";
    await writeFile(join(project, "loop.json"), JSON.stringify({
      version: 1,
      name: "command-loop",
      goal: "Create marker",
      prompt: "Make marker",
      maxTurns: 2,
      evaluator: {
        type: "command",
        command: process.execPath,
        args: ["check.mjs"],
      },
    }), "utf8");
    await writeFile(join(project, "check.mjs"), `
      import { existsSync } from "node:fs";
      process.exit(existsSync("marker.txt") ? 0 : 1);
    `, "utf8");

    await runLoopCommand({
      config,
      configRoot: root,
      command: "/loop",
      rest: "loop.json",
      questioner: { question: async () => "" },
      cwd: project,
      oneShotYolo: true,
      runAgent: async ({ turn }) => {
        if (turn === 2) {
          await writeFile(join(project, "marker.txt"), "ok", "utf8");
        }
        return `agent turn ${turn}`;
      },
    });

    const outputText = stripAnsi(chunks.join(""));
    const runFiles = await readdir(join(root, "loops", "runs"));
    const runRecord = JSON.parse(await readFile(join(root, "loops", "runs", runFiles[0] ?? ""), "utf8"));
    assert.match(outputText, /Loop/u);
    assert.match(outputText, /loop passed/u);
    assert.equal(runRecord.status, "passed");
    assert.equal(runRecord.turns, 2);
    assert.equal(runRecord.evaluations.at(-1)?.passed, true);
    assert.equal(Object.hasOwn(runRecord, "result"), false);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("loop command previews a spec without running the agent or writing a run record", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-loop-preview-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-loop-preview-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const config = defaultConfig();
    config.permissions.mode = "ask";
    await writeFile(join(project, "loop.json"), JSON.stringify({
      version: 1,
      name: "preview-loop",
      goal: "Inspect the loop",
      maxTurns: 4,
      evaluator: {
        type: "command",
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
      },
    }), "utf8");

    await runLoopCommand({
      config,
      configRoot: root,
      command: "/loop",
      rest: "loop.json --dry-run",
      questioner: { question: async () => "" },
      cwd: project,
      oneShotYolo: false,
      runAgent: async () => {
        throw new Error("agent should not run during dry-run");
      },
    });

    const outputText = stripAnsi(chunks.join(""));
    assert.match(outputText, /loop preview/u);
    assert.match(outputText, /budget: 4 agent turns \+ 4 evaluator runs/u);
    await assert.rejects(readdir(join(root, "loops", "runs")), { code: "ENOENT" });
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("loop command asks before executing evaluator commands outside yolo mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-loop-confirm-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-loop-confirm-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const askConfig = defaultConfig();
    askConfig.permissions.mode = "ask";
    await writeFile(join(project, "loop.json"), JSON.stringify({
      version: 1,
      name: "confirm-loop",
      goal: "Respect permission mode",
      evaluator: {
        type: "command",
        command: process.execPath,
      },
    }), "utf8");

    await runLoopCommand({
      config: askConfig,
      configRoot: root,
      command: "/loop",
      rest: "loop.json",
      questioner: { question: async () => "n" },
      cwd: project,
      oneShotYolo: false,
      runAgent: async () => "should not run",
    });

    assert.match(stripAnsi(chunks.join("")), /loop blocked/u);
    await assert.rejects(readdir(join(root, "loops", "runs")), { code: "ENOENT" });
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("loop command picker describes saved specs by goal", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-loop-picker-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-loop-picker-project-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    await mkdir(join(project, ".dream", "loops"), { recursive: true });
    await writeFile(join(project, ".dream", "loops", "picked.json"), JSON.stringify({
      version: 1,
      name: "picked-loop",
      goal: "Show this goal in the picker",
      evaluator: {
        type: "command",
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
      },
    }), "utf8");

    await runLoopCommand({
      config: defaultConfig(),
      configRoot: root,
      command: "/loop",
      rest: "",
      questioner: {
        question: async () => "",
        select: async (options) => {
          const picked = options.choices.find((choice) => choice.value === ".dream/loops/picked.json");
          assert.equal(options.title, "Loops");
          assert.equal(picked?.description, "picked-loop: Show this goal in the picker");
          return undefined;
        },
      },
      cwd: project,
      oneShotYolo: true,
      runAgent: async () => "should not run",
    });
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});
