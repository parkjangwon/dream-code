import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    "{\"id\":\"call_1\",\"tool\":\"read\",\"path\":\"README.md\"}",
    "{\"tool\":\"list\",\"path\":\"src\"}",
    "{\"tool\":\"search\",\"query\":\"TODO\",\"path\":\"src\"}",
    "{\"tool\":\"research\",\"query\":\"Dream Code docs\"}",
    "{\"tool\":\"shell\",\"command\":\"pwd\"}",
    "{\"tool\":\"mkdir\",\"path\":\"src\"}",
    "{\"tool\":\"write\",\"path\":\"src/index.ts\",\"content\":\"console.log(1)\"}",
    "{\"tool\":\"delete\",\"path\":\"src/index.ts\"}",
    "{\"tool\":\"mcp\",\"server\":\"fake\",\"name\":\"echo\",\"arguments\":{\"text\":\"hi\"}}",
    "```",
  ].join("\n"));

  assert.equal(requests.length, 9);
  assert.equal(requests[0]?.tool, "read");
  assert.equal(requests[0]?.id, "call_1");
  assert.equal(requests[1]?.tool, "list");
  assert.equal(requests[2]?.tool, "search");
  assert.equal(requests[3]?.tool, "research");
  assert.equal(requests[4]?.tool, "shell");
  assert.equal(requests[5]?.tool, "mkdir");
  assert.equal(requests[6]?.tool, "write");
  assert.equal(requests[7]?.tool, "delete");
  assert.equal(requests[8]?.tool, "mcp");
});

test("extractAgentToolRequests recovers bare tool JSON objects", () => {
  const requests = extractAgentToolRequests([
    "{\"tool\":\"read\",\"path\":\"README.md\"}",
    "{\"tool\":\"shell\",\"command\":\"ls -la\"}",
  ].join("\n"));

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.tool, "read");
  assert.equal(requests[1]?.tool, "shell");
});

test("extractAgentToolRequests recovers simple single-quoted tool objects", () => {
  const requests = extractAgentToolRequests("{'tool':'read','path':'package.json'}{'tool':'shell','command':'pwd'}");

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.tool, "read");
  assert.equal(requests[1]?.tool, "shell");
});

test("extractAgentToolRequests parses structured tool call envelopes", () => {
  const requests = extractAgentToolRequests([
    "```dream-tool",
    "{\"tool_calls\":[{\"tool\":\"read\",\"path\":\"README.md\"},{\"tool\":\"grep\",\"query\":\"TODO\"}]}",
    "{\"calls\":[{\"tool\":\"list\",\"path\":\"src\"}]}",
    "```",
  ].join("\n"));

  assert.equal(requests.length, 3);
  assert.equal(requests[0]?.tool, "read");
  assert.equal(requests[1]?.tool, "grep");
  assert.equal(requests[2]?.tool, "list");
});

test("runAgentToolRequest gates shell tools behind yolo permission", async () => {
  const result = await runAgentToolRequest({ tool: "shell", command: "echo no" }, "ask");

  assert.equal(result.ok, false);
  assert.match(result.output, /Permission required/u);
});

test("runAgentToolRequest asks before mutating workspace in ask mode", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-agent-approval-"));
  const previous = process.cwd();
  try {
    process.chdir(project);

    const denied = await runAgentToolRequest(
      { tool: "write", path: "denied.txt", content: "no" },
      { mode: "ask", approveTool: async () => false },
    );
    const approved = await runAgentToolRequest(
      { tool: "write", path: "approved.txt", content: "yes" },
      { mode: "ask", approveTool: async () => true },
    );

    assert.equal(denied.ok, false);
    assert.match(denied.output, /Permission required/u);
    assert.equal(approved.ok, true);
    assert.equal(await readFile(join(project, "approved.txt"), "utf8"), "yes");
  } finally {
    process.chdir(previous);
    await rm(project, { recursive: true, force: true });
  }
});

test("runAgentToolRequest blocks mutating tools in plan mode", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-agent-plan-"));
  try {
    const result = await runAgentToolRequest(
      { tool: "write", path: "plan.txt", content: "no" },
      { mode: "plan", workspaceRoot: project },
    );

    assert.equal(result.ok, false);
    assert.match(result.output, /Plan mode/u);
    assert.match(result.output, /preview: write plan.txt \(2 chars\)/u);
    assert.match(result.output, /risk: mutates workspace/u);
    await assert.rejects(readFile(join(project, "plan.txt"), "utf8"), { code: "ENOENT" });
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("runAgentToolRequest explains the next safest action when permission is required", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-agent-preview-"));
  try {
    const result = await runAgentToolRequest(
      { tool: "delete", path: "src/index.ts" },
      { mode: "ask", workspaceRoot: project },
    );

    assert.equal(result.ok, false);
    assert.match(result.output, /preview: delete src\/index\.ts/u);
    assert.match(result.output, /next: approve this tool, switch to yolo, or ask Dream Code for a non-mutating plan/u);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("permission preview explains shell command risk and safe next action", async () => {
  const result = await runAgentToolRequest(
    { tool: "shell", command: "npm install left-pad" },
    { mode: "ask" },
  );

  assert.equal(result.ok, false);
  assert.match(result.output, /preview: shell npm install left-pad/u);
  assert.match(result.output, /risk: external command can install packages or change machine state/u);
  assert.match(result.output, /next: approve this tool, switch to yolo, or ask Dream Code for a non-mutating plan/u);
});

test("permission preview includes edit diff context", async () => {
  const result = await runAgentToolRequest(
    { tool: "edit", path: "src/index.ts", search: "oldValue", replace: "newValue" },
    { mode: "plan" },
  );

  assert.equal(result.ok, false);
  assert.match(result.output, /preview: edit src\/index\.ts \(first match\)/u);
  assert.match(result.output, /old: oldValue/u);
  assert.match(result.output, /new: newValue/u);
});

test("runAgentToolRequest checkpoints existing files before mutating them", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-history-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-agent-history-project-"));
  try {
    await mkdir(join(project, "src"), { recursive: true });
    await writeFile(join(project, "src", "index.ts"), "const marker = 'before';\n", "utf8");

    const result = await runAgentToolRequest(
      { tool: "edit", path: "src/index.ts", search: "before", replace: "after" },
      { mode: "yolo", workspaceRoot: project, configRoot: root },
    );

    const historyFiles = await readFile(join(root, "file-history", "index.jsonl"), "utf8");
    assert.equal(result.ok, true);
    assert.match(result.output, /checkpoint:/u);
    assert.match(historyFiles, /src\/index\.ts/u);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("runAgentToolRequest blocks destructive shell commands in yolo mode", async () => {
  const result = await runAgentToolRequest({ tool: "shell", command: "git reset --hard" }, "yolo");

  assert.equal(result.ok, false);
  assert.match(result.output, /blocked: destructive shell pattern detected/u);
});

test("runAgentToolRequest does not block harmless shell text that mentions risky commands", async () => {
  const result = await runAgentToolRequest({ tool: "shell", command: "echo git reset --hard" }, "yolo");

  assert.equal(result.ok, true);
  assert.doesNotMatch(result.output, /blocked:/u);
});

test("runAgentToolRequest applies configured shell allowlist", async () => {
  const blocked = await runAgentToolRequest(
    { tool: "shell", command: "node -e \"console.log('agent')\"" },
    { mode: "yolo", shellAllowedExecutables: ["git"] },
  );
  const allowed = await runAgentToolRequest(
    { tool: "shell", command: "node -e \"console.log('agent')\"" },
    { mode: "yolo", shellAllowedExecutables: ["node"] },
  );

  assert.equal(blocked.ok, false);
  assert.match(blocked.output, /not allowlisted/u);
  assert.equal(allowed.ok, true);
  assert.match(allowed.output, /agent/u);
});

test("runAgentToolRequest enforces explicit per-agent tool policy", async () => {
  const result = await runAgentToolRequest(
    { tool: "shell", command: "echo no" },
    { mode: "yolo", allowedTools: ["read"] },
  );

  assert.equal(result.ok, false);
  assert.match(result.output, /not allowed/u);
});

test("runAgentToolRequest cancels long-running shell tools", async () => {
  const controller = new AbortController();
  const resultPromise = runAgentToolRequest(
    { tool: "shell", command: "node -e \"setTimeout(() => {}, 10000)\"" },
    { mode: "yolo", signal: controller.signal, shellTimeoutMs: 10_000 },
  );

  controller.abort();
  const result = await resultPromise;

  assert.equal(result.ok, false);
  assert.match(result.output, /cancelled/u);
});

test("runAgentToolRequest rejects workspace file access outside the workspace", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-agent-tools-"));
  const previous = process.cwd();
  try {
    process.chdir(project);

    const result = await runAgentToolRequest({ tool: "write", path: "../outside.txt", content: "no" }, "yolo");

    assert.equal(result.ok, false);
    assert.match(result.output, /outside workspace/u);
  } finally {
    process.chdir(previous);
    await rm(project, { recursive: true, force: true });
  }
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

test("runAgentToolRequest controls files and searches workspace", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-agent-file-control-"));
  const previous = process.cwd();
  try {
    process.chdir(project);

    const created = await runAgentToolRequest({ tool: "mkdir", path: "src" }, "yolo");
    const written = await runAgentToolRequest({ tool: "write", path: "src/index.ts", content: "const marker = 'Dream';\n" }, "yolo");
    const listed = await runAgentToolRequest({ tool: "list", path: "src" }, "ask");
    const searched = await runAgentToolRequest({ tool: "search", query: "marker", path: "src" }, "ask");
    const edited = await runAgentToolRequest({ tool: "edit", path: "src/index.ts", search: "Dream", replace: "Code" }, "yolo");
    const deleted = await runAgentToolRequest({ tool: "delete", path: "src/index.ts" }, "yolo");

    assert.equal(created.ok, true);
    assert.equal(written.ok, true);
    assert.match(listed.output, /index\.ts/u);
    assert.match(searched.output, /marker/u);
    assert.equal(edited.ok, true);
    assert.equal(deleted.ok, true);
  } finally {
    process.chdir(previous);
    await rm(project, { recursive: true, force: true });
  }
});

test("runAgentToolRequest searches nested Java files", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-agent-java-search-"));
  const previous = process.cwd();
  try {
    process.chdir(project);
    await mkdir(join(project, "app", "src"), { recursive: true });
    await writeFile(join(project, "app", "src", "Main.java"), "class Main { String token = \"needle\"; }\n", "utf8");

    const result = await runAgentToolRequest({ tool: "search", query: "needle", path: "app" }, "ask");

    assert.equal(result.ok, true);
    assert.match(result.output, /Main\.java:1/u);
  } finally {
    process.chdir(previous);
    await rm(project, { recursive: true, force: true });
  }
});
