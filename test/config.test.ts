import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  configFilePath,
  defaultConfig,
  loadConfig,
  modelConfigFilePath,
  resolveEffectivePermissionMode,
  saveConfig,
  teamConfigFilePath,
  togglePersistedYolo,
  type DreamConfig,
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

test("configFilePath uses TOML as the main config file", () => {
  assert.equal(configFilePath("/tmp/dream-home"), join("/tmp/dream-home", "config.toml"));
});

test("togglePersistedYolo flips and saves the permission mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-yolo-"));
  try {
    await mkdir(root, { recursive: true });
    await saveConfig(root, defaultConfig());
    const enabled = await togglePersistedYolo(root);
    const disabled = await togglePersistedYolo(root);
    const savedToml = await readFile(configFilePath(root), "utf8");
    const modelsToml = await readFile(modelConfigFilePath(root), "utf8");
    const teamToml = await readFile(teamConfigFilePath(root), "utf8");

    assert.equal(enabled.permissions.mode, "yolo");
    assert.equal(disabled.permissions.mode, "ask");
    assert.match(savedToml, /\[permissions\]\nmode = "ask"/);
    assert.doesNotMatch(savedToml, /\[model\]/);
    assert.match(modelsToml, /\[model\.single\.models\]/);
    assert.match(teamToml, /\[\[team\]\]/);
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

test("loadConfig normalizes OpenCode Go model IDs from TOML", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-opencode-go-"));
  try {
    await mkdir(root, { recursive: true });
    const config = defaultConfig();
    const legacyConfig: DreamConfig = {
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
    await saveConfig(root, legacyConfig);

    const loaded = await loadConfig(root);

    assert.deepEqual(loaded.model.single.models, {
      low: "deepseek-v4-flash",
      mid: "kimi-k2.7-code",
      high: "glm-5.2",
    });
    assert.equal(loaded.model.auto.routes[0]?.model, "kimi-k2.7-code");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
