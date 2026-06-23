import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { defaultConfig, loadConfig } from "../src/config.js";
import { appendSessionTurn, listSessions, startSession } from "../src/session-store.js";
import { runWorkspaceCommand } from "../src/tui-workspace-commands.js";

test("runWorkspaceCommand stores user and assistant turns in the active session", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-session-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const session = await startSession(root, "/tmp/dream-code");
    const baseConfig = defaultConfig();
    const config = {
      ...baseConfig,
      model: {
        ...baseConfig.model,
        single: {
          ...baseConfig.model.single,
          provider: "unknown-provider",
        },
      },
    };
    await runWorkspaceCommand(
      "What is this project?",
      config,
      true,
      { question: async () => "" },
      root,
      {
        currentId: () => session.id,
        switchTo: () => undefined,
      },
    );
    const sessions = await listSessions(root);

    assert.equal(sessions[0]?.summary, "What is this project?");
    assert.equal(sessions[0]?.turns[0]?.role, "user");
    assert.equal(sessions[0]?.turns[1]?.role, "assistant");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand handles shared slash commands from the palette", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-shared-commands-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const current = await startSession(root, "/tmp/dream-code");
    await appendSessionTurn(root, current.id, "user", "Keep current session.");
    const previous = await startSession(root, "/tmp/older-project");
    await appendSessionTurn(root, previous.id, "user", "Restore this conversation.");
    let switchedSessionId = "";
    const runtime = {
      currentId: () => current.id,
      switchTo: (sessionId: string) => {
        switchedSessionId = sessionId;
      },
    };
    const questioner = {
      question: async () => "",
      select: async () => previous.id,
    };

    const status = await runWorkspaceCommand("/status", defaultConfig(), false, questioner, root, runtime);
    const yolo = await runWorkspaceCommand("/yolo", defaultConfig(), false, questioner, root, runtime);
    await runWorkspaceCommand("/rename Shared router", yolo.config, false, questioner, root, runtime);
    await runWorkspaceCommand("/session", yolo.config, false, questioner, root, runtime);
    const exit = await runWorkspaceCommand("/exit", yolo.config, false, questioner, root, runtime);

    const sessions = await listSessions(root);
    const outputText = chunks.join("");
    assert.equal(status.shouldContinue, true);
    assert.equal(yolo.config.permissions.mode, "ask");
    assert.equal((await loadConfig(root)).permissions.mode, "ask");
    assert.equal(sessions.find((session) => session.id === current.id)?.name, "Shared router");
    assert.equal(switchedSessionId, previous.id);
    assert.equal(exit.shouldContinue, false);
    assert.match(outputText, /Dream Status/u);
    assert.match(outputText, /ask/u);
    assert.match(outputText, /session: older-project/u);
    assert.match(outputText, /Good night/u);
    assert.doesNotMatch(outputText, /unknown command/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});
