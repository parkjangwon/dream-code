import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  extractAgentToolRequests,
  formatToolResults,
  runAgentToolRequest,
} from "../src/agent-tools.js";

test("extractAgentToolRequests parses JSONL dream-tool blocks", () => {
  const requests = extractAgentToolRequests([
    "```dream-tool",
    "{\"tool\":\"read\",\"path\":\"README.md\"}",
    "{\"tool\":\"research\",\"query\":\"Dream Code docs\"}",
    "{\"tool\":\"shell\",\"command\":\"pwd\"}",
    "```",
  ].join("\n"));

  assert.equal(requests.length, 3);
  assert.equal(requests[0]?.tool, "read");
  assert.equal(requests[1]?.tool, "research");
  assert.equal(requests[2]?.tool, "shell");
});

test("runAgentToolRequest gates shell tools behind yolo permission", async () => {
  const result = await runAgentToolRequest({ tool: "shell", command: "echo no" }, "ask");

  assert.equal(result.ok, false);
  assert.match(result.output, /Permission required/u);
});

test("runAgentToolRequest annotates risky shell commands in yolo mode", async () => {
  const result = await runAgentToolRequest({ tool: "shell", command: "echo git reset --hard" }, "yolo");

  assert.equal(result.ok, true);
  assert.match(result.output, /risk: destructive shell pattern detected/u);
});

test("runAgentToolRequest reads project files and formats results", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-agent-tools-"));
  const previous = process.cwd();
  try {
    process.chdir(project);
    await writeFile(join(project, "README.md"), "Dream Code", "utf8");

    const result = await runAgentToolRequest({ tool: "read", path: "README.md" }, "ask");
    const formatted = formatToolResults([result]);

    assert.equal(result.ok, true);
    assert.match(result.output, /Dream Code/u);
    assert.match(formatted, /tool results/u);
  } finally {
    process.chdir(previous);
    await rm(project, { recursive: true, force: true });
  }
});
