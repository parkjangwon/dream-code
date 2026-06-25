import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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

test("parseModelList reads Ollama tag responses", () => {
  const models = parseModelList(JSON.stringify({
    models: [
      { name: "llama3.2:latest" },
      { name: "qwen2.5-coder:7b" },
    ],
  }));

  assert.deepEqual(models, ["llama3.2:latest", "qwen2.5-coder:7b"]);
});

test("inferModelProfile classifies lightweight and strong model names", () => {
  assert.equal(inferModelProfile("vendor/model-flash").tier, "low");
  assert.equal(inferModelProfile("vendor/model-pro").tier, "high");
  assert.equal(inferModelProfile("openrouter/z-ai/glm-5.2").tier, "high");
  assert.equal(inferModelProfile("sakana/fugu-ultra").tier, "high");
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

test("refreshModelCatalogForProviders discovers Ollama models from native tags API", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-ollama-discovery-"));
  const server = await startOllamaTagsServer(["llama3.2:latest", "qwen2.5-coder:7b"]);

  try {
    await writeProviderCredential(root, "ollama", {
      authMode: "none",
      baseUrl: server.baseUrl,
    });

    const refresh = await refreshModelCatalogForProviders(root, new Set(["ollama"]), {});

    assert.equal(refresh.liveProviders, 1);
    assert.equal(refresh.fallbackProviders, 0);
    assert.deepEqual(refresh.catalog.providers["ollama"]?.models, ["llama3.2:latest", "qwen2.5-coder:7b"]);
    assert.deepEqual(server.requests, ["/api/tags"]);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

type OllamaTagsServer = {
  readonly baseUrl: string;
  readonly requests: readonly string[];
  readonly close: () => Promise<void>;
};

function startOllamaTagsServer(models: readonly string[]): Promise<OllamaTagsServer> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url === "/api/tags") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ models: models.map((name) => ({ name })) }));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!isAddressInfo(address)) {
        reject(new Error("Ollama tag server did not expose a TCP port."));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        requests,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => {
            if (error !== undefined) {
              closeReject(error);
              return;
            }
            closeResolve();
          });
        }),
      });
    });
  });
}

function isAddressInfo(value: string | AddressInfo | null): value is AddressInfo {
  return typeof value === "object" && value !== null && "port" in value;
}
