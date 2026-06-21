import test from "node:test";
import assert from "node:assert/strict";

import { marketplaceLocationForSource } from "../src/plugin-marketplace-source.js";

test("marketplaceLocationForSource resolves GitHub shorthand to a cloneable marketplace source", async () => {
  const location = await marketplaceLocationForSource("anthropics/claude-code@v2.0", process.cwd());

  assert.deepEqual(location, {
    url: "https://github.com/anthropics/claude-code.git",
    ref: "v2.0",
  });
});

test("marketplaceLocationForSource preserves refs on non-GitHub git URLs", async () => {
  const location = await marketplaceLocationForSource("https://gitlab.example.com/team/plugins.git#v1.0.0", process.cwd());

  assert.deepEqual(location, {
    url: "https://gitlab.example.com/team/plugins.git",
    ref: "v1.0.0",
  });
});
