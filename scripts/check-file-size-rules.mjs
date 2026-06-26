#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const rules = [
  { root: "src", extensions: /\.(?:ts|tsx)$/u, maxPureLoc: 250 },
  { root: "test", extensions: /\.(?:ts|tsx)$/u, maxPureLoc: 500 },
  { root: "scripts", extensions: /\.mjs$/u, maxPureLoc: 250 },
];
const failures = [];

for (const rule of rules) {
  for (const filePath of walkFiles(rule.root, rule.extensions)) {
    const pureLoc = pureLineCount(readFileSync(join(root, filePath), "utf8"));
    if (pureLoc > rule.maxPureLoc) {
      failures.push(`${filePath}: ${pureLoc} pure LOC exceeds ${rule.maxPureLoc}`);
    }
  }
}

if (failures.length > 0) {
  console.error(["File size check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exitCode = 1;
} else {
  console.log("File size check passed.");
}

function walkFiles(directory, extensions) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(filePath, extensions);
    }
    return entry.isFile() && extensions.test(filePath) ? [filePath] : [];
  });
}

function pureLineCount(text) {
  return text
    .split(/\r?\n/u)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("//");
    }).length;
}
