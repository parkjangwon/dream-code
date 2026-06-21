import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { defaultConfig, loadConfig } from "../src/config.js";
import {
  notificationCommandForPlatform,
  notifyAgentComplete,
  sendNativeNotification,
} from "../src/notifications.js";
import { runWorkspaceCommand } from "../src/tui-workspace-commands.js";

test("notificationCommandForPlatform picks native commands by platform", () => {
  const notification = { kind: "completion" as const, title: "Dream Code", body: "Done" };

  assert.equal(notificationCommandForPlatform(notification, {}, "darwin")?.command, "osascript");
  assert.equal(notificationCommandForPlatform(notification, {}, "linux")?.command, "notify-send");
  assert.equal(notificationCommandForPlatform(notification, { TERMUX_VERSION: "1" }, "linux")?.command, "termux-notification");
  assert.equal(notificationCommandForPlatform(notification, {}, "win32")?.command, "powershell.exe");
});

test("sendNativeNotification supports a custom command hook", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-notification-"));
  const out = join(root, "notification.txt");
  const script = join(root, "notify.cjs");
  try {
    await writeFile(
      script,
      "require('node:fs').writeFileSync(process.env.TEST_OUT, process.env.DREAM_NOTIFICATION_TITLE + ':' + process.env.DREAM_NOTIFICATION_BODY)",
      "utf8",
    );
    const ok = await sendNativeNotification(
      { kind: "completion", title: "Dream Code", body: "Done" },
      {
        DREAM_FORCE_NOTIFICATION: "1",
        DREAM_NOTIFICATION_COMMAND: `node ${script}`,
        TEST_OUT: out,
      },
      "linux",
    );

    assert.equal(ok, true);
    assert.equal(await readFile(out, "utf8"), "Dream Code:Done");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("notifyAgentComplete respects the completion duration threshold", async () => {
  const config = {
    ...defaultConfig(),
    notifications: {
      enabled: true,
      completion: true,
      permissionRequired: true,
      minCompletionMs: 10_000,
    },
  };

  assert.equal(await notifyAgentComplete(config, "quick task", 999), false);
});

test("runWorkspaceCommand toggles native notifications", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-notification-command-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const result = await runWorkspaceCommand(
      "/notifications off",
      defaultConfig(),
      true,
      { question: async () => "" },
      root,
    );
    const saved = await loadConfig(root);

    assert.equal(result.config.notifications.enabled, false);
    assert.equal(saved.notifications.enabled, false);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});
