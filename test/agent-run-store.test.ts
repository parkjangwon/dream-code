import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { formatAgentRuns } from "../src/agent-run-format.js";
import { listAgentRuns, startAgentRun } from "../src/agent-run-store.js";

test("agent run store persists state, output, and wire events", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-runs-"));
  try {
    const run = await startAgentRun(root, {
      id: "run-test",
      kind: "agent",
      agentId: "code-reviewer",
      agentName: "Code Reviewer",
      prompt: "review this patch",
    });

    run.write("hello ");
    run.tool("read README.md");
    run.write("world");
    await run.finish("done");

    const records = await listAgentRuns(root);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.status, "done");
    assert.equal(records[0]?.outputChars, "hello world".length);
    assert.equal(records[0]?.toolCalls, 1);

    const output = await readFile(records[0]?.outputPath ?? "", "utf8");
    const wire = await readFile(records[0]?.transcriptPath ?? "", "utf8");
    assert.equal(output, "hello world");
    assert.match(wire, /"type":"tool"/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatAgentRuns shows active and completed runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-runs-"));
  try {
    const run = await startAgentRun(root, {
      id: "run-live",
      kind: "swarm-lane",
      agentId: "security-reviewer",
      agentName: "Security Reviewer",
      prompt: "audit secrets",
    });
    run.write("scanning");

    const live = stripAnsi(await formatAgentRuns(root));
    assert.match(live, /Running/u);
    assert.match(live, /RUNNING/u);
    assert.match(live, /Security Reviewer/u);

    await run.finish("cancelled", { error: "stopped" });
    const completed = stripAnsi(await formatAgentRuns(root));
    assert.match(completed, /STOPPED/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
