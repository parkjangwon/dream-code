import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { defaultConfig, loadConfig } from "../src/config.js";
import { listSessions, startSession } from "../src/session-store.js";
import { handleInput } from "../src/tui.js";

test("handleInput routes /model to model selection instead of status output", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tui-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const result = await handleInput(
      "/model high",
      defaultConfig(),
      { oneShotYolo: true, configRoot: root },
      { question: async () => "" },
    );
    const saved = await loadConfig(root);

    assert.equal(result.config.model.single.defaultTier, "high");
    assert.equal(saved.model.single.defaultTier, "high");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("handleInput renames the current session", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tui-session-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const session = await startSession(root, "/tmp/dream-code");
    await handleInput(
      "/rename Night build",
      defaultConfig(),
      { oneShotYolo: true, configRoot: root },
      { question: async () => "" },
      {
        currentId: () => session.id,
        switchTo: () => undefined,
      },
    );
    const sessions = await listSessions(root);

    assert.equal(sessions[0]?.name, "Night build");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("handleInput opens saved sessions through picker", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tui-session-list-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const first = await startSession(root, "/tmp/dream-code");
    const second = await startSession(root, "/tmp/other-project");
    let switched = "";
    await handleInput(
      "/session",
      defaultConfig(),
      { oneShotYolo: true, configRoot: root },
      {
        question: async () => "",
        select: async (options) => {
          assert.equal(options.title, "Sessions");
          assert.equal(options.choices.some((choice) => choice.value === first.id), true);
          return second.id;
        },
      },
      {
        currentId: () => first.id,
        switchTo: (sessionId) => {
          switched = sessionId;
        },
      },
    );

    assert.equal(switched, second.id);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});
