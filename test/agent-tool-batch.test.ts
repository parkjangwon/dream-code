import assert from "node:assert/strict";
import test from "node:test";

import { runAgentToolBatch } from "../src/agent-tool-batch.js";
import type { AgentToolRequest, AgentToolResult } from "../src/agent-tools.js";

test("runAgentToolBatch runs adjacent read-only tools concurrently and preserves result order", async () => {
  const starts: string[] = [];
  const finishes: string[] = [];
  const requests: readonly AgentToolRequest[] = [
    { id: "slow", tool: "read", path: "a.ts" },
    { id: "fast", tool: "stat", path: "b.ts" },
  ];

  const results = await runAgentToolBatch(requests, async (request) => {
    starts.push(request.id ?? request.tool);
    await delay(request.id === "slow" ? 25 : 1);
    finishes.push(request.id ?? request.tool);
    return resultFor(request);
  });

  assert.deepEqual(starts, ["slow", "fast"]);
  assert.deepEqual(finishes, ["fast", "slow"]);
  assert.deepEqual(results.map((result) => result.request.id), ["slow", "fast"]);
});

test("runAgentToolBatch keeps mutating tools in sequence between read-only batches", async () => {
  const events: string[] = [];
  const requests: readonly AgentToolRequest[] = [
    { id: "read-a", tool: "read", path: "a.ts" },
    { id: "write-b", tool: "write", path: "b.ts", content: "b" },
    { id: "read-c", tool: "stat", path: "c.ts" },
  ];

  await runAgentToolBatch(requests, async (request) => {
    events.push(`start:${request.id}`);
    await delay(1);
    events.push(`finish:${request.id}`);
    return resultFor(request);
  });

  assert.deepEqual(events, [
    "start:read-a",
    "finish:read-a",
    "start:write-b",
    "finish:write-b",
    "start:read-c",
    "finish:read-c",
  ]);
});

function resultFor(request: AgentToolRequest): AgentToolResult {
  return { request, ok: true, output: `ok ${request.tool}` };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
