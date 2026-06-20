import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  configFilePath,
  defaultConfig,
  loadConfig,
  resolveEffectivePermissionMode,
  saveConfig,
  togglePersistedYolo,
} from "../src/config.js";

test("loadConfig returns defaults when the config file is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-config-"));
  try {
    const config = await loadConfig(root);
    assert.equal(config.permissions.mode, "ask");
    assert.equal(config.model.mode, "single");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("togglePersistedYolo flips and saves the permission mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-yolo-"));
  try {
    await mkdir(root, { recursive: true });
    await saveConfig(root, defaultConfig());
    const enabled = await togglePersistedYolo(root);
    const disabled = await togglePersistedYolo(root);

    assert.equal(enabled.permissions.mode, "yolo");
    assert.equal(disabled.permissions.mode, "ask");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveEffectivePermissionMode prefers one-shot yolo over saved config", () => {
  const config = defaultConfig();
  config.permissions.mode = "ask";

  assert.equal(resolveEffectivePermissionMode(config, true), "yolo");
  assert.equal(resolveEffectivePermissionMode(config, false), "ask");
});

test("loadConfig normalizes legacy OpenCode Go model IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-opencode-go-"));
  try {
    await mkdir(root, { recursive: true });
    const config = defaultConfig();
    const legacyConfig = {
      ...config,
      model: {
        ...config.model,
        single: {
          ...config.model.single,
          provider: "opencode-go",
          models: {
            low: "opencode-go/deepseek-v4-flash",
            mid: "opencode-go/kimi-k2.7-code",
            high: "opencode-go/glm-5.2",
          },
        },
        auto: {
          routes: [
            {
              id: "legacy-go",
              provider: "opencode-go",
              model: "opencode-go/kimi-k2.7-code",
              tier: "mid",
              match: ["code"],
            },
          ],
        },
      },
    };
    await writeFile(configFilePath(root), `${JSON.stringify(legacyConfig, null, 2)}\n`, "utf8");

    const loaded = await loadConfig(root);

    assert.deepEqual(loaded.model.single.models, {
      low: "deepseek-v4-flash",
      mid: "kimi-k2.7",
      high: "glm-5.2",
    });
    assert.equal(loaded.model.auto.routes[0]?.model, "kimi-k2.7");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
