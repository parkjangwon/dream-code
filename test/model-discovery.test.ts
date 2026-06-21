import test from "node:test";
import assert from "node:assert/strict";

import { parseModelList } from "../src/model-discovery.js";
import { bestModelForTier, inferModelProfile } from "../src/model-profile.js";

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
