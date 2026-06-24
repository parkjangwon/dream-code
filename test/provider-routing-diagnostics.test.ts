import assert from "node:assert/strict";
import test from "node:test";

import { formatRoutePreview } from "../src/model-routing.js";

test("route preview explains health, speed, and cost signals for selected and skipped providers", () => {
  const preview = formatRoutePreview({
    mode: "auto",
    single: {
      provider: "openai",
      models: {
        low: "gpt-low",
        mid: "gpt-mid",
        high: "gpt-high",
      },
      defaultTier: "mid",
    },
    auto: {
      routes: [],
      categories: [{
        id: "coding",
        label: "Coding",
        tier: "low",
        match: ["implement"],
        candidates: [
          "deepseek/deepseek-fast",
          "openai/gpt-mini",
        ],
      }],
    },
  }, "implement the cache", {
    connectedProviders: new Set(["deepseek", "openai"]),
    unhealthyModels: new Set(["deepseek/deepseek-fast"]),
  });

  assert.match(preview, /coding -> openai\/gpt-mini/u);
  assert.match(preview, /health: healthy/u);
  assert.match(preview, /tier: low/u);
  assert.match(preview, /cost: economy/u);
  assert.match(preview, /speed: fast/u);
  assert.match(preview, /degraded: deepseek\/deepseek-fast unhealthy/u);
});
