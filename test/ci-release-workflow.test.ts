import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("release workflow runs check, smoke json, release-check json, and package evidence", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");

  assert.match(workflow, /npm run check/u);
  assert.match(workflow, /dist\/src\/cli\.js smoke --json/u);
  assert.match(workflow, /dist\/src\/cli\.js release-check --json/u);
  assert.match(workflow, /npm pack --dry-run --json/u);
  assert.match(workflow, /release\/smoke\.json/u);
  assert.match(workflow, /release\/release-check\.json/u);
  assert.match(workflow, /release\/pack-dry-run\.json/u);
});
