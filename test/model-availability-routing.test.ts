import test from "node:test";
import assert from "node:assert/strict";

import { selectModelCandidatesForPrompt } from "../src/model-routing.js";

test("selectModelCandidatesForPrompt skips models unavailable to the active credential", () => {
  const selected = selectModelCandidatesForPrompt({
    mode: "auto",
    single: {
      provider: "openai",
      models: { low: "gpt-5.4-mini", mid: "gpt-5.5-pro", high: "gpt-5.5" },
      defaultTier: "mid",
    },
    auto: {
      routes: [],
      categories: [{
        id: "architect",
        label: "Architect",
        tier: "high",
        match: ["architecture"],
        candidates: ["openai/gpt-5.5-pro", "openai/gpt-5.5"],
      }],
      agentRoutes: [],
    },
  }, "architecture plan", undefined, {
    connectedProviders: new Set(["openai"]),
    modelAvailable: (_provider, model) => model !== "gpt-5.5-pro",
  });

  assert.equal(selected[0]?.provider, "openai");
  assert.equal(selected[0]?.model, "gpt-5.5");
  assert.deepEqual(selected[0]?.skipped, ["openai/gpt-5.5-pro unavailable"]);
});

test("selectModelCandidatesForPrompt falls back from unavailable single-provider model", () => {
  const selected = selectModelCandidatesForPrompt({
    mode: "single",
    single: {
      provider: "openai",
      models: { low: "gpt-5.4-mini", mid: "gpt-5.5-pro", high: "gpt-5.5" },
      defaultTier: "mid",
    },
    auto: { routes: [] },
  }, "hello", undefined, {
    modelAvailable: (_provider, model) => model !== "gpt-5.5-pro",
  });

  assert.equal(selected[0]?.provider, "openai");
  assert.equal(selected[0]?.model, "gpt-5.5");
  assert.equal(selected[0]?.tier, "high");
});
