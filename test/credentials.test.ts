import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  loadCredentials,
  readProviderCredential,
  writeProviderCredential,
} from "../src/credentials.js";

test("loadCredentials returns an empty store when absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-creds-"));
  try {
    const credentials = await loadCredentials(root);

    assert.deepEqual(credentials.providers, {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeProviderCredential saves API key and region metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-creds-"));
  try {
    await writeProviderCredential(root, "kimi", {
      apiKey: " secret ",
      region: "cn",
      baseUrl: "https://api.moonshot.cn/v1/",
    });
    const credential = await readProviderCredential("kimi", root);

    assert.deepEqual(credential, {
      apiKey: "secret",
      region: "cn",
      baseUrl: "https://api.moonshot.cn/v1",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeProviderCredential saves OAuth metadata without an API key", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-creds-"));
  try {
    await writeProviderCredential(root, "openai", {
      authMode: "oauth",
      region: "chatgpt",
      baseUrl: "https://chatgpt.com/backend-api/codex/",
      accountId: " acct_test ",
    });
    const credential = await readProviderCredential("openai", root);

    assert.deepEqual(credential, {
      authMode: "oauth",
      region: "chatgpt",
      baseUrl: "https://chatgpt.com/backend-api/codex",
      accountId: "acct_test",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
