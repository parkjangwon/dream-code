#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checkedRoots = [".github", "scripts", "src", "test"];
const checkedFiles = ["README.md", "ROADMAP.md", "package.json", "tsconfig.json"];
const failures = [];

for (const filePath of checkedFiles.concat(checkedRoots.flatMap(walkTextFiles))) {
  const text = readFileSync(join(root, filePath), "utf8");
  if (!text.endsWith("\n")) {
    failures.push(`${filePath}: missing final newline`);
  }
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/[ \t]+$/u.test(line)) {
      failures.push(`${filePath}:${index + 1}: trailing whitespace`);
    }
  }
}

if (failures.length > 0) {
  console.error(["Format check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exitCode = 1;
} else {
  console.log("Format check passed.");
}

function walkTextFiles(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkTextFiles(filePath);
    }
    return entry.isFile() && isTextFile(filePath) ? [filePath] : [];
  });
}

function isTextFile(filePath) {
  return /\.(?:ts|js|mjs|json|md|yml|yaml|toml|sh)$/u.test(filePath);
}
