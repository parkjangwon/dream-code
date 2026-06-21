import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { stripAnsi } from "../src/ansi.js";
import { defaultConfig, loadConfig } from "../src/config.js";
import { writeProviderCredential } from "../src/credentials.js";
import { apiKeyEnvKeys, listProviderDefinitions } from "../src/provider-registry.js";
import { runWorkspaceCommand } from "../src/tui-workspace-commands.js";
import { startModelListServer } from "./model-server-fixture.js";

test("runWorkspaceCommand routes /auto to automatic model routing", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-auto-"));
  const chunks: string[] = [];
  const restoreEnv = clearEnvKeys(allProviderApiKeyEnvKeys());
  const server = await startModelListServer(["deepseek-v4-flash", "deepseek-v4-pro"]);
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await writeProviderCredential(root, "deepseek", {
      apiKey: "sk-deepseek",
      region: "global",
      baseUrl: server.baseUrl,
    });
    const result = await runWorkspaceCommand(
      "/auto",
      defaultConfig(),
      true,
      { question: async () => "" },
      root,
    );
    const saved = await loadConfig(root);

    assert.equal(result.config.model.mode, "auto");
    assert.equal(saved.model.mode, "auto");
    assert.match(stripAnsi(chunks.join("")), /auto mode:/u);
  } finally {
    stdout.mock.restore();
    restoreEnv();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand toggles /auto back to single routing", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-auto-toggle-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const config = defaultConfig();
    const result = await runWorkspaceCommand(
      "/auto",
      { ...config, model: { ...config.model, mode: "auto" } },
      true,
      { question: async () => "" },
      root,
    );

    assert.equal(result.config.model.mode, "single");
    assert.match(stripAnsi(chunks.join("")), /auto mode: off/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand excludes disabled env providers from /auto", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-auto-disabled-"));
  const chunks: string[] = [];
  const restoreEnv = clearEnvKeys(allProviderApiKeyEnvKeys());
  const server = await startModelListServer(["deepseek-v4-flash", "deepseek-v4-pro"]);
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    process.env["GEMINI_API_KEY"] = "sk-gemini";
    await writeProviderCredential(root, "deepseek", {
      apiKey: "sk-deepseek",
      region: "global",
      baseUrl: server.baseUrl,
    });
    const config = {
      ...defaultConfig(),
      providers: {
        gemini: { enabled: false },
      },
    };
    const result = await runWorkspaceCommand(
      "/auto",
      config,
      true,
      { question: async () => "" },
      root,
    );

    assert.equal(result.config.model.mode, "auto");
    assert.equal(result.config.model.auto.categories?.[0]?.candidates.some((candidate) => candidate.startsWith("gemini/")), false);
    assert.match(stripAnsi(chunks.join("")), /providers 1 connected/u);
  } finally {
    stdout.mock.restore();
    restoreEnv();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

function clearEnvKeys(keys: readonly string[]): () => void {
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function allProviderApiKeyEnvKeys(): readonly string[] {
  return [...new Set(listProviderDefinitions().flatMap(apiKeyEnvKeys))];
}
