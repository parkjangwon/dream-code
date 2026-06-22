import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  formatMentionedReferencesForPrompt,
  loadMentionedReferences,
} from "../src/file-mention-context.js";

test("loadMentionedReferences includes mentioned file content", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-file-mention-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "auth.ts"), "line one\nline two\nline three\n", "utf8");

    const references = await loadMentionedReferences("Explain @src/auth.ts#2-3", { cwd: root });
    const formatted = formatMentionedReferencesForPrompt(references);

    assert.equal(references.length, 1);
    assert.match(formatted, /@src\/auth\.ts#2-3/u);
    assert.doesNotMatch(formatted, /line one/u);
    assert.match(formatted, /line two\nline three/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadMentionedReferences includes directory listings only", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-dir-mention-"));
  try {
    await mkdir(join(root, "src", "components"), { recursive: true });
    await writeFile(join(root, "src", "components", "Button.tsx"), "export function Button() {}\n", "utf8");

    const references = await loadMentionedReferences("List @src/components/", { cwd: root });
    const formatted = formatMentionedReferencesForPrompt(references);

    assert.equal(references.length, 1);
    assert.match(formatted, /Button\.tsx/u);
    assert.doesNotMatch(formatted, /export function Button/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
