import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { loadModelCatalog, modelCatalogFilePath } from "../src/model-catalog.js";

test("loadModelCatalog recovers from corrupt cache JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-model-catalog-"));
  try {
    await writeFile(modelCatalogFilePath(root), "{not-json", "utf8");

    const catalog = await loadModelCatalog(root);

    assert.equal(catalog.version, 1);
    assert.deepEqual(catalog.providers, {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
