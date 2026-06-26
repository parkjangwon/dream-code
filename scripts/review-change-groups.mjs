#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const groups = [
  { name: "ci-release", pattern: /^(?:\.github\/workflows\/|test\/ci-release-workflow\.test\.ts$|scripts\/.*(?:quick|size|review).*)/u },
  { name: "remote-security", pattern: /^(?:src\/remote-(?:auth|http|server-request)\.ts|test\/remote-(?:audit|rbac|server-browser-auth).*)/u },
  { name: "remote-web", pattern: /^(?:src\/remote-web|src\/remote-pwa|test\/remote-web)/u },
  { name: "remote-server", pattern: /^(?:src\/remote-(?:server|command|projects|session)|test\/remote-server)/u },
  { name: "agent-tests", pattern: /^test\/agent-/u },
  { name: "package", pattern: /^(?:package(?:-lock)?\.json|README\.md|install\.sh|uninstall\.sh)/u },
];

const status = spawnSync("git", ["status", "--short"], { encoding: "utf8" });
if (status.error !== undefined) {
  throw status.error;
}
if (status.status !== 0) {
  console.error(status.stderr);
  process.exit(status.status ?? 1);
}

const changedFiles = status.stdout
  .split("\n")
  .filter((line) => line.length > 0)
  .map((line) => line.slice(3).replace(/^.* -> /u, ""));

const grouped = new Map(groups.map((group) => [group.name, []]));
grouped.set("other", []);

for (const filePath of changedFiles) {
  const group = groups.find((candidate) => candidate.pattern.test(filePath));
  grouped.get(group?.name ?? "other")?.push(filePath);
}

for (const [name, files] of grouped) {
  if (files.length === 0) {
    continue;
  }
  console.log(`${name}:`);
  for (const file of files.sort()) {
    console.log(`  ${file}`);
  }
}
