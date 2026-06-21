import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { defaultConfig } from "../src/config.js";
import { appendSessionTurn, startSession } from "../src/session-store.js";
import { buildBottomStatusLines, renderBottomStatusLines } from "../src/tui-status-bar.js";

test("renderBottomStatusLines shows model, project git state, and context percentage", () => {
  const lines = renderBottomStatusLines({
    model: "deepseek/deepseek-v4-flash",
    mode: "single",
    tier: "mid",
    projectName: "dream-code",
    gitBranch: "main",
    gitDirty: true,
    contextTokens: 13_105,
    contextWindowTokens: 262_100,
    permission: "YOLO",
  }).map(stripAnsi);

  assert.match(lines.join("\n"), /\[deepseek\/deepseek-v4-flash · mid\]/u);
  assert.match(lines.join("\n"), /dream-code git:\(main\*\)/u);
  assert.match(lines.join("\n"), /Context/u);
  assert.match(lines.join("\n"), /5%/u);
  assert.match(lines.join("\n"), /13\.1k\/262\.1k/u);
  assert.match(lines.join("\n"), /YOLO/u);
});

test("renderBottomStatusLines marks auto routing mode", () => {
  const lines = renderBottomStatusLines({
    model: "deepseek/deepseek-v4-flash",
    mode: "auto",
    tier: "low",
    projectName: "dream-code",
    gitBranch: "main",
    gitDirty: false,
    contextTokens: 0,
    contextWindowTokens: 262_100,
    permission: "ASK",
  }).map(stripAnsi);

  assert.match(lines.join("\n"), /\[AUTO routing\]/u);
  assert.doesNotMatch(lines.join("\n"), /deepseek\/deepseek-v4-flash/u);
});

test("renderBottomStatusLines shows manual reasoning effort when set", () => {
  const lines = renderBottomStatusLines({
    model: "openai/gpt-5.5",
    mode: "single",
    tier: "mid",
    projectName: "dream-code",
    gitBranch: "main",
    gitDirty: false,
    contextTokens: 0,
    contextWindowTokens: 262_100,
    permission: "ASK",
    reasoningEffort: "xhigh",
  }).map(stripAnsi);

  assert.match(lines.join("\n"), /\[openai\/gpt-5\.5 · mid · think xhigh\]/u);
});


test("buildBottomStatusLines estimates context from compact summary when present", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-status-compact-"));
  const project = await mkdtemp(join(tmpdir(), "dream-status-project-"));
  try {
    const session = await startSession(root, project);
    await appendSessionTurn(root, session.id, "user", "x".repeat(40_000));
    await mkdir(join(root, "compacts"), { recursive: true });
    await writeFile(join(root, "compacts", `${session.id}.md`), "x".repeat(320), "utf8");

    const lines = (await buildBottomStatusLines({
      config: defaultConfig(),
      configRoot: root,
      sessionId: session.id,
      cwd: project,
      oneShotYolo: false,
    })).map(stripAnsi);

    assert.match(lines.join("\n"), /Context/u);
    assert.match(lines.join("\n"), /\(80\/262\.1k\)/u);
    assert.doesNotMatch(lines.join("\n"), /10\.0k\/262\.1k/u);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});
