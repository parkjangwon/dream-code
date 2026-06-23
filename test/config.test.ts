import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
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
  togglePersistedYolo,
  type DreamConfig,
} from "../src/config.js";
import { initializeDreamHome } from "../src/config-init.js";
import { credentialsFilePath } from "../src/credentials.js";

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

test("initializeDreamHome creates first-run files and directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-init-"));
  try {
    await initializeDreamHome(root);

    const savedConfig = await readFile(configFilePath(root), "utf8");
    const savedModels = await readFile(modelConfigFilePath(root), "utf8");
    const savedCredentials = await readFile(credentialsFilePath(root), "utf8");

    assert.match(savedConfig, /\[permissions\]\nmode = "ask"/u);
    assert.match(savedModels, /\[model\.single\.models\]/u);
    assert.deepEqual(JSON.parse(savedCredentials), { version: 1, providers: {} });
    await assertDirectory(join(root, "artifacts"));
    await assertDirectory(join(root, "compacts"));
    await assertDirectory(join(root, "exports"));
    await assertDirectory(join(root, "sessions"));
    await assertDirectory(join(root, "skills"));
    await assertDirectory(join(root, "workflows", "runs"));
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
    const savedToml = await readFile(configFilePath(root), "utf8");
    const modelsToml = await readFile(modelConfigFilePath(root), "utf8");

    assert.equal(enabled.permissions.mode, "yolo");
    assert.equal(disabled.permissions.mode, "ask");
    assert.match(savedToml, /\[permissions\]\nmode = "ask"/);
    assert.doesNotMatch(savedToml, /\[model\]/);
    assert.match(modelsToml, /\[model\.single\.models\]/);
    await assertFileMissing(join(root, legacyAgentConfigFileName()));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig persists provider enabled overrides", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-provider-config-"));
  try {
    const config = {
      ...defaultConfig(),
      providers: {
        gemini: { enabled: false },
      },
    };
    await saveConfig(root, config);

    const savedToml = await readFile(configFilePath(root), "utf8");
    const loaded = await loadConfig(root);

    assert.match(savedToml, /\[providers\.gemini\]\nenabled = false/u);
    assert.equal(loaded.providers["gemini"]?.enabled, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig persists shell allowlist policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-shell-policy-"));
  try {
    const config = {
      ...defaultConfig(),
      tools: {
        ...defaultConfig().tools,
        shell: {
          allowedExecutables: ["git", "node", "npm"],
        },
      },
    };
    await saveConfig(root, config);

    const savedToml = await readFile(configFilePath(root), "utf8");
    const loaded = await loadConfig(root);

    assert.match(savedToml, /\[tools\.shell\]\nallowedExecutables = \["git", "node", "npm"\]/u);
    assert.deepEqual(loaded.tools.shell.allowedExecutables, ["git", "node", "npm"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function assertFileMissing(filePath: string): Promise<void> {
  await assert.rejects(() => stat(filePath), { code: "ENOENT" });
}

async function assertDirectory(filePath: string): Promise<void> {
  assert.equal((await stat(filePath)).isDirectory(), true);
}

function legacyAgentConfigFileName(): string {
  return `${"cr"}${"ew"}.toml`;
}

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
