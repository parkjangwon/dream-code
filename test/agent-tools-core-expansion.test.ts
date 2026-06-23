import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  extractAgentToolRequests,
  runAgentToolRequest,
} from "../src/agent-tools.js";

test("extractAgentToolRequests parses expanded core dream tools", () => {
  const requests = extractAgentToolRequests([
    "```dream-tool",
    "{\"tool\":\"patch\",\"patch\":\"--- a/a.txt\\n+++ b/a.txt\\n@@ -1 +1 @@\\n-old\\n+new\\n\"}",
    "{\"tool\":\"diff\",\"path\":\"src\"}",
    "{\"tool\":\"diagnostics\"}",
    "{\"tool\":\"stat\",\"path\":\"README.md\"}",
    "{\"tool\":\"move\",\"from\":\"a.txt\",\"to\":\"b.txt\"}",
    "{\"tool\":\"copy\",\"from\":\"b.txt\",\"to\":\"c.txt\"}",
    "{\"tool\":\"fetch\",\"url\":\"http://127.0.0.1:9999/doc\"}",
    "{\"tool\":\"artifact\",\"action\":\"write\",\"name\":\"report.md\",\"content\":\"done\"}",
    "{\"tool\":\"task\",\"action\":\"add\",\"label\":\"QA\",\"detail\":\"Run checks\"}",
    "```",
  ].join("\n"));

  assert.deepEqual(requests.map((request) => request.tool), [
    "patch",
    "diff",
    "diagnostics",
    "stat",
    "move",
    "copy",
    "fetch",
    "artifact",
    "task",
  ]);
});

test("workspace expansion tools patch, diff, stat, move, and copy safely", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tools-workspace-"));
  try {
    await writeFile(join(root, "note.txt"), "alpha\nbeta\ngamma\n", "utf8");

    const patch = await runAgentToolRequest({
      tool: "patch",
      patch: "--- a/note.txt\n+++ b/note.txt\n@@ -1,3 +1,3 @@\n alpha\n-beta\n+BETA\n gamma\n",
    }, { mode: "yolo", workspaceRoot: root, configRoot: root });
    const stat = await runAgentToolRequest({ tool: "stat", path: "note.txt" }, { mode: "ask", workspaceRoot: root });
    const copy = await runAgentToolRequest({ tool: "copy", from: "note.txt", to: "copy.txt" }, { mode: "yolo", workspaceRoot: root, configRoot: root });
    const move = await runAgentToolRequest({ tool: "move", from: "copy.txt", to: "moved.txt" }, { mode: "yolo", workspaceRoot: root, configRoot: root });
    const diff = await runAgentToolRequest({ tool: "diff", path: "note.txt" }, { mode: "ask", workspaceRoot: root });

    assert.equal(patch.ok, true);
    assert.equal(await readFile(join(root, "note.txt"), "utf8"), "alpha\nBETA\ngamma\n");
    assert.match(stat.output, /file note\.txt/u);
    assert.equal(copy.ok, true);
    assert.equal(move.ok, true);
    assert.equal(await readFile(join(root, "moved.txt"), "utf8"), "alpha\nBETA\ngamma\n");
    assert.match(diff.output, /BETA/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("external expansion tools fetch exact urls and run diagnostics with bounded output", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tools-external-"));
  const server = await listenText("dream fetch ok");
  try {
    const address = server.address() as AddressInfo | null;
    if (address === null) {
      throw new Error("test server did not expose an address");
    }
    const port = address.port;
    const fetched = await runAgentToolRequest({ tool: "fetch", url: `http://127.0.0.1:${port}/docs` }, { mode: "ask", workspaceRoot: root });
    const diagnostics = await runAgentToolRequest({ tool: "diagnostics" }, { mode: "yolo", workspaceRoot: root });

    assert.equal(fetched.ok, true);
    assert.match(fetched.output, /status 200/u);
    assert.match(fetched.output, /dream fetch ok/u);
    assert.equal(diagnostics.ok, true);
    assert.match(diagnostics.output, /No supported project diagnostics detected/u);
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("state expansion tools persist artifacts and task ledger updates", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tools-state-"));
  try {
    const artifact = await runAgentToolRequest(
      { tool: "artifact", action: "write", name: "release-note.md", content: "# Release\nReady\n" },
      { mode: "yolo", configRoot: root },
    );
    const listedArtifacts = await runAgentToolRequest(
      { tool: "artifact", action: "list" },
      { mode: "yolo", configRoot: root },
    );
    const task = await runAgentToolRequest(
      { tool: "task", action: "add", label: "QA", detail: "Run tmux scenario" },
      { mode: "yolo", configRoot: root },
    );
    const updatedTask = await runAgentToolRequest(
      { tool: "task", action: "update", id: "T001", status: "done" },
      { mode: "yolo", configRoot: root },
    );

    assert.equal(artifact.ok, true);
    assert.match(artifact.output, /release-note\.md/u);
    assert.match(listedArtifacts.output, /release-note\.md/u);
    assert.match(task.output, /T001/u);
    assert.match(updatedTask.output, /done/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("state expansion tools support nested artifacts and permission gates", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tools-state-nested-"));
  const project = await mkdtemp(join(tmpdir(), "dream-tools-state-project-"));
  try {
    const denied = await runAgentToolRequest(
      { tool: "artifact", action: "write", name: "reports/summary.md", content: "no" },
      { mode: "ask", configRoot: root, approveTool: async () => false },
    );
    const written = await runAgentToolRequest(
      { tool: "artifact", action: "write", name: "reports/summary.md", content: "# Summary\n" },
      { mode: "yolo", configRoot: root, workspaceRoot: project },
    );
    const listed = await runAgentToolRequest(
      { tool: "artifact", action: "list" },
      { mode: "yolo", configRoot: root, workspaceRoot: project },
    );

    assert.equal(denied.ok, false);
    assert.match(denied.output, /Permission required/u);
    assert.equal(written.ok, true);
    assert.equal(await readFile(join(root, "artifacts", "reports", "summary.md"), "utf8"), "# Summary\n");
    assert.match(listed.output, /reports\/summary\.md/u);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("artifact delete is gated as a mutating tool", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tools-delete-artifact-"));
  try {
    const written = await runAgentToolRequest(
      { tool: "artifact", action: "write", name: "report.md", content: "draft" },
      { mode: "yolo", configRoot: root },
    );
    const blocked = await runAgentToolRequest(
      { tool: "artifact", action: "delete", name: "report.md" },
      { mode: "plan", configRoot: root },
    );

    assert.equal(written.ok, true);
    assert.equal(blocked.ok, false);
    assert.match(blocked.output, /Plan mode blocks/u);
    assert.equal(await readFile(join(root, "artifacts", "report.md"), "utf8"), "draft");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function listenText(body: string): Promise<Server> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
