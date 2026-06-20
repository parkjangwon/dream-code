import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { defaultConfig } from "../src/config.js";
import { listSessions, startSession } from "../src/session-store.js";
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
