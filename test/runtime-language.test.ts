import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

test("runtime source files stay English-only", async () => {
  const files = await listTypeScriptFiles("src");
  const sourceTexts = await Promise.all(files.map((file) => readFile(file, "utf8")));

  for (const sourceText of sourceTexts) {
    assert.doesNotMatch(sourceText, /[가-힣]/u);
  }
});

async function listTypeScriptFiles(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        return listTypeScriptFiles(path);
      }
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        return [path];
      }
      return [];
    }),
  );

  return nestedFiles.flat();
}
