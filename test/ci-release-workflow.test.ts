import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("release workflow runs check, smoke json, release-check json, and package evidence", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");

  assert.match(workflow, /compatibility:/u);
  assert.match(workflow, /needs: compatibility/u);
  assert.match(workflow, /node-version:\s*\n\s+- "22"\s*\n\s+- "24"/u);
  assert.match(workflow, /matrix\.node-version/u);
  assert.match(workflow, /npm run check/u);
  assert.match(workflow, /npm audit --omit=dev/u);
  assert.match(workflow, /dist\/src\/cli\.js smoke --json/u);
  assert.match(workflow, /dist\/src\/cli\.js release-check --json/u);
  assert.match(workflow, /npm pack --dry-run --json/u);
  assert.match(workflow, /actions\/attest@281a49d4cbb0a72c9575a50d18f6deb515a11deb/u);
  assert.doesNotMatch(workflow, /actions\/attest@v4/u);
  assert.match(workflow, /id-token: write/u);
  assert.match(workflow, /attestations: write/u);
  assert.match(workflow, /artifact-metadata: write/u);
  assert.match(workflow, /release\/smoke\.json/u);
  assert.match(workflow, /release\/release-check\.json/u);
  assert.match(workflow, /release\/pack-dry-run\.json/u);
});

test("ci workflow checks pull requests and main branch pushes", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.match(workflow, /pull_request/u);
  assert.match(workflow, /push/u);
  assert.match(workflow, /branches:\s*\n\s+- main/u);
  assert.match(workflow, /npm ci --ignore-scripts/u);
  assert.match(workflow, /npm run lint/u);
  assert.match(workflow, /npm test/u);
  assert.match(workflow, /npm pack --dry-run --json/u);
  assert.match(workflow, /node-version:\s*\n\s+- "22"\s*\n\s+- "24"/u);
  assert.match(workflow, /matrix\.node-version/u);
  assert.match(workflow, /actions\/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd/u);
  assert.match(workflow, /actions\/setup-node@a0853c24544627f65ddf259abe73b1d18a591444/u);
});

test("package scripts include quick and file-size feedback loops", async () => {
  const manifest = await readFile("package.json", "utf8");
  const quickRunner = await readFile("scripts/run-quick-tests.mjs", "utf8");

  assert.match(manifest, /"size:check": "node scripts\/check-file-size-rules\.mjs"/u);
  assert.match(manifest, /"changes:review": "node scripts\/review-change-groups\.mjs"/u);
  assert.match(manifest, /npm run size:check/u);
  assert.match(manifest, /"test:quick": "npm run build && node scripts\/run-quick-tests\.mjs"/u);
  assert.match(quickRunner, /readdirSync\(testDir\)/u);
  assert.doesNotMatch(quickRunner, /dist\/test\/ansi\.test\.js/u);
  assert.match(quickRunner, /quickNamePatterns/u);
});
