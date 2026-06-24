import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { defaultConfig } from "../src/config.js";
import { runRoutePreviewCommand } from "../src/route-preview-cli.js";

test("route preview command emits JSON diagnostics for scripting", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-route-preview-"));
  try {
    const config = defaultConfig();
    const output = JSON.parse(await runRoutePreviewCommand({
      configRoot: root,
      config,
      rest: ["--json", "implement", "the", "remote", "audit"],
    })) as {
      readonly title: string;
      readonly selected?: { readonly provider: string; readonly model: string };
      readonly diagnostics?: { readonly health: string; readonly cost: string; readonly speed: string };
    };

    assert.equal(output.title, "Dream Route Preview");
    assert.equal(typeof output.selected?.provider, "string");
    assert.equal(typeof output.selected?.model, "string");
    assert.equal(output.diagnostics?.health, "healthy");
    assert.equal(typeof output.diagnostics?.cost, "string");
    assert.equal(typeof output.diagnostics?.speed, "string");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
