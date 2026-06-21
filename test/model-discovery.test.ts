import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeProviderCredential } from "../src/credentials.js";
import { parseModelList, refreshModelCatalogForProviders } from "../src/model-discovery.js";
import { bestModelForTier, inferModelProfile } from "../src/model-profile.js";
import { startModelListServer } from "./model-server-fixture.js";

test("parseModelList reads OpenAI-compatible model responses", () => {
  const models = parseModelList(JSON.stringify({
    data: [
      { id: "gpt-fast" },
      { id: "gpt-pro" },
      "custom-lite",
    ],
  }));

  assert.deepEqual(models, ["gpt-fast", "gpt-pro", "custom-lite"]);
});

test("inferModelProfile classifies lightweight and strong model names", () => {
  assert.equal(inferModelProfile("vendor/model-flash").tier, "low");
  assert.equal(inferModelProfile("vendor/model-pro").tier, "high");
  assert.equal(inferModelProfile("vendor/model-balanced").tier, "mid");
});

test("bestModelForTier selects a catalog candidate for the requested tier", () => {
  assert.equal(bestModelForTier(["model-lite", "model-pro", "model-balanced"], "low"), "model-lite");
  assert.equal(bestModelForTier(["model-lite", "model-pro", "model-balanced"], "high"), "model-pro");
});

test("refreshModelCatalogForProviders discovers every connected provider", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-model-discovery-"));
  const server = await startModelListServer(["provider-lite", "provider-pro"]);

  try {
    for (const provider of ["gemini", "qwen", "openrouter"]) {
      await writeProviderCredential(root, provider, {
        apiKey: `sk-${provider}`,
        baseUrl: server.baseUrl,
      });
    }

    const refresh = await refreshModelCatalogForProviders(root, new Set([
      "gemini",
      "qwen",
      "openrouter",
    ]), {});

    assert.equal(refresh.liveProviders, 3);
    assert.equal(refresh.fallbackProviders, 0);
    assert.deepEqual(refresh.catalog.providers["gemini"]?.models, ["provider-lite", "provider-pro"]);
    assert.deepEqual(refresh.catalog.providers["qwen"]?.models, ["provider-lite", "provider-pro"]);
    assert.deepEqual(refresh.catalog.providers["openrouter"]?.models, ["provider-lite", "provider-pro"]);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
