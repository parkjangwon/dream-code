import assert from "node:assert/strict";
import test from "node:test";

import { createCliStartCache, type CliConfigLoader, type CliHomeInitializer } from "../src/cli-start-cache.js";
import { defaultConfig } from "../src/config.js";

test("start cache reuses initialized home and loaded config per root", async () => {
  let initialized = 0;
  let loaded = 0;
  const initialize: CliHomeInitializer = async (root) => {
    initialized += 1;
    return { root };
  };
  const load: CliConfigLoader = async () => {
    loaded += 1;
    return defaultConfig();
  };
  const cache = createCliStartCache(initialize, load);

  await cache.get("/tmp/dream-start-cache");
  await cache.get("/tmp/dream-start-cache");

  assert.equal(initialized, 1);
  assert.equal(loaded, 1);
});
