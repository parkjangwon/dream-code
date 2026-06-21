import test from "node:test";
import assert from "node:assert/strict";

import { selectModelForPrompt } from "../src/model-routing.js";

test("selectModelForPrompt carries manual reasoning effort separately from model tier", () => {
  const selected = selectModelForPrompt({
    mode: "single",
    single: {
      provider: "openai",
      models: {
        low: "gpt-5.4-mini",
        mid: "gpt-5.5",
        high: "gpt-5.5",
      },
      defaultTier: "mid",
    },
    reasoning: { effort: "xhigh" },
    auto: { routes: [] },
  }, "plan the architecture");

  assert.equal(selected.provider, "openai");
  assert.equal(selected.model, "gpt-5.5");
  assert.equal(selected.tier, "mid");
  assert.equal(selected.reasoningEffort, "xhigh");
});
