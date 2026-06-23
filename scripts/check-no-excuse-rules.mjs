#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

function readText(path) {
  return readFileSync(join(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function fail(message) {
  failures.push(message);
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const version = packageJson.version;

if (packageLock.version !== version) {
  fail(`package-lock.json version ${packageLock.version} does not match package.json ${version}`);
}
if (packageLock.packages?.[""]?.version !== version) {
  fail(`package-lock root package version ${packageLock.packages?.[""]?.version} does not match package.json ${version}`);
}

const constants = readText("src/constants.ts");
if (!constants.includes(`DREAM_VERSION = "${version}"`)) {
  fail(`src/constants.ts DREAM_VERSION does not match package.json ${version}`);
}

const readmeVersions = [...readText("README.md").matchAll(/v0\.\d+\.\d+/gu)].map((match) => match[0]);
const staleReadmeVersions = readmeVersions.filter((entry) => entry !== `v${version}`);
if (staleReadmeVersions.length > 0) {
  fail(`README.md contains stale release versions: ${[...new Set(staleReadmeVersions)].join(", ")}`);
}

if (readText("src/config.ts").includes('permissions: { mode: "yolo" }')) {
  fail("defaultConfig must not start fresh installs in yolo permission mode");
}

const forbiddenRules = [
  { pattern: /\bas\s+any\b/u, label: "as any" },
  { pattern: /:\s*any\b/u, label: "any annotation" },
  { pattern: /@ts-ignore/u, label: "@ts-ignore" },
  { pattern: /@ts-expect-error/u, label: "@ts-expect-error" },
  { pattern: /\bexport\s+(?:let|var)\b/u, label: "mutable export" },
];

for (const filePath of typeScriptFiles("src").concat(typeScriptFiles("test"))) {
  const text = readText(filePath);
  for (const rule of forbiddenRules) {
    if (rule.pattern.test(text)) {
      fail(`${filePath}: forbidden ${rule.label}`);
    }
  }
}

if (failures.length > 0) {
  console.error(["No-excuse audit failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exitCode = 1;
} else {
  console.log("No-excuse audit passed.");
}

function typeScriptFiles(directory) {
  return walk(directory).filter((filePath) => filePath.endsWith(".ts"));
}

function walk(directory) {
  const entries = readdirSync(join(root, directory), { withFileTypes: true });
  return entries.flatMap((entry) => {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return walk(filePath);
    }
    return entry.isFile() ? [filePath] : [];
  });
}
