import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  extractAgentToolRequests,
  runAgentToolRequest,
} from "../src/agent-tools.js";

const execFileAsync = promisify(execFile);

test("extractAgentToolRequests parses advanced base tools", () => {
  const requests = extractAgentToolRequests([
    "```dream-tool",
    "{\"tool\":\"grep\",\"query\":\"TODO|FIXME\",\"path\":\"src\",\"regex\":true,\"glob\":\"**/*.ts\",\"contextLines\":1,\"caseSensitive\":false}",
    "{\"tool\":\"glob\",\"pattern\":\"src/**/*.ts\"}",
    "{\"tool\":\"read\",\"path\":\"src/index.ts\",\"startLine\":2,\"endLine\":4}",
    "{\"tool\":\"edit\",\"path\":\"src/index.ts\",\"search\":\"old\",\"replace\":\"new\",\"replaceAll\":true,\"expectedReplacements\":2}",
    "```",
  ].join("\n"));

  assert.equal(requests.length, 4);
  assert.equal(requests[0]?.tool, "grep");
  assert.equal(requests[1]?.tool, "glob");
  assert.equal(requests[2]?.tool, "read");
  assert.equal(requests[3]?.tool, "edit");
});

test("runAgentToolRequest greps regex matches with glob and context", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-agent-grep-"));
  try {
    await mkdir(join(project, "src"), { recursive: true });
    await writeFile(join(project, "src", "index.ts"), ["before", "const marker = 'Dream';", "after"].join("\n"), "utf8");
    await writeFile(join(project, "src", "ignore.md"), "marker\n", "utf8");

    const result = await runAgentToolRequest(
      { tool: "grep", query: "MARKER", path: "src", regex: true, glob: "**/*.ts", contextLines: 1, caseSensitive: false },
      { mode: "ask", workspaceRoot: project },
    );

    assert.equal(result.ok, true);
    assert.match(result.output, /index\.ts:1: before/u);
    assert.match(result.output, /index\.ts:2: const marker/u);
    assert.match(result.output, /index\.ts:3: after/u);
    assert.doesNotMatch(result.output, /ignore\.md/u);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("runAgentToolRequest globs gitignored files out of results", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-agent-glob-"));
  try {
    await execFileAsync("git", ["init"], { cwd: project });
    await mkdir(join(project, "src"), { recursive: true });
    await writeFile(join(project, ".gitignore"), "src/generated.ts\n", "utf8");
    await writeFile(join(project, "src", "index.ts"), "export const visible = true;\n", "utf8");
    await writeFile(join(project, "src", "generated.ts"), "export const ignored = true;\n", "utf8");

    const result = await runAgentToolRequest(
      { tool: "glob", pattern: "*.ts", path: "src" },
      { mode: "ask", workspaceRoot: project },
    );

    assert.equal(result.ok, true);
    assert.match(result.output, /src\/index\.ts/u);
    assert.doesNotMatch(result.output, /generated\.ts/u);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("runAgentToolRequest reads a bounded line range", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-agent-read-range-"));
  try {
    await writeFile(join(project, "notes.txt"), ["one", "two", "three", "four"].join("\n"), "utf8");

    const result = await runAgentToolRequest(
      { tool: "read", path: "notes.txt", startLine: 2, endLine: 3 },
      { mode: "ask", workspaceRoot: project },
    );

    assert.equal(result.ok, true);
    assert.match(result.output, /lines 2-3/u);
    assert.doesNotMatch(result.output, /one/u);
    assert.match(result.output, /two\nthree/u);
    assert.doesNotMatch(result.output, /four/u);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("runAgentToolRequest enforces edit replacement counts", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-agent-edit-"));
  try {
    await writeFile(join(project, "repeat.txt"), "old old old\n", "utf8");

    const rejected = await runAgentToolRequest(
      { tool: "edit", path: "repeat.txt", search: "old", replace: "new", replaceAll: true, expectedReplacements: 2 },
      { mode: "yolo", workspaceRoot: project },
    );

    assert.equal(rejected.ok, false);
    assert.match(rejected.output, /expected 2 replacements but found 3/u);
    assert.equal(await readFile(join(project, "repeat.txt"), "utf8"), "old old old\n");

    const accepted = await runAgentToolRequest(
      { tool: "edit", path: "repeat.txt", search: "old", replace: "new", replaceAll: true, expectedReplacements: 3 },
      { mode: "yolo", workspaceRoot: project },
    );

    assert.equal(accepted.ok, true);
    assert.equal(await readFile(join(project, "repeat.txt"), "utf8"), "new new new\n");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
