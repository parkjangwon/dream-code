import test from "node:test";
import assert from "node:assert/strict";

import {
  describeModelMode,
  selectModelForPrompt,
  selectSingleProviderModel,
} from "../src/model-routing.js";

test("selectSingleProviderModel returns the requested tier model", () => {
  const route = selectSingleProviderModel({
    provider: "openai",
    models: {
      low: "gpt-low",
      mid: "gpt-mid",
      high: "gpt-high",
    },
    defaultTier: "mid",
  }, "high");

  assert.equal(route.provider, "openai");
  assert.equal(route.model, "gpt-high");
  assert.equal(route.tier, "high");
});

test("describeModelMode explains single provider tier routing", () => {
  const description = describeModelMode({
    mode: "single",
    single: {
      provider: "kimi",
      models: {
        low: "kimi-fast",
        mid: "kimi-balanced",
        high: "kimi-deep",
      },
      defaultTier: "mid",
    },
    auto: { routes: [] },
  });

  assert.match(description, /single provider/i);
  assert.match(description, /kimi/);
});

test("selectModelForPrompt routes auto mode by prompt keyword", () => {
  const selected = selectModelForPrompt({
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
      routes: [
        {
          id: "reviewer",
          provider: "kimi",
          model: "kimi-deep",
          tier: "high",
          match: ["review"],
        },
      ],
    },
  }, "review this patch");

  assert.equal(selected.provider, "kimi");
  assert.equal(selected.model, "kimi-deep");
  assert.equal(selected.reason, "auto route: reviewer");
});
