import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { formatAgentBoard } from "../src/agent-board.js";
import { formatAgentRuns } from "../src/agent-run-format.js";
import { listAgentRuns, startAgentRun } from "../src/agent-run-store.js";
import { registerActor, updateActorStatus } from "../src/actor-store.js";
import { sendInboxMessage } from "../src/inbox-store.js";
import { formatAgentsOverview } from "../src/tui-agent-commands.js";
import { agentViewLines, renderAgentView } from "../src/tui-agent-view.js";

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
    const actor = await registerActor(root, {
      id: "actor-live",
      role: "subagent",
      name: "Security Reviewer",
      task: "audit secrets",
      runId: run.id,
    });
    await sendInboxMessage(root, {
      receiverActorId: actor.id,
      senderActorId: "main",
      type: "user",
      content: "Also check CI secrets.",
    });
    run.write("scanning");

    const live = stripAnsi(await formatAgentRuns(root));
    assert.match(live, /Running/u);
    assert.match(live, /RUNNING/u);
    assert.match(live, /Security Reviewer/u);
    assert.match(live, /inbox 1/u);

    await run.finish("cancelled", { error: "stopped" });
    const completed = stripAnsi(await formatAgentRuns(root));
    assert.match(completed, /STOPPED/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatAgentsOverview hides completed runs from the default agent view", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-runs-active-"));
  try {
    const run = await startAgentRun(root, {
      id: "run-completed",
      kind: "swarm-lane",
      agentId: "code-reviewer",
      agentName: "Code Reviewer",
      prompt: "review completed work",
    });
    await run.finish("done");

    const board = stripAnsi(await formatAgentsOverview(root));
    assert.match(board, /Agents\s+Running\s+Library/u);
    assert.match(board, /No subagents are currently running/u);
    assert.doesNotMatch(board, /completed/u);
    assert.doesNotMatch(board, /DONE/u);
    assert.doesNotMatch(board, /Code Reviewer/u);
    assert.doesNotMatch(board, /Dispatch:/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatAgentBoard groups agents by attention, work, and completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-board-"));
  try {
    const working = await startAgentRun(root, {
      id: "run-working",
      kind: "agent",
      agentId: "security-reviewer",
      agentName: "Security Reviewer",
      prompt: "audit secrets",
    });
    working.write("Scanning dependency manifests.");

    const idle = await registerActor(root, {
      id: "actor-idle",
      role: "subagent",
      name: "UX Reviewer",
      task: "review agent UX",
      runId: "run-idle",
    });
    await updateActorStatus(root, idle.id, "idle", { summary: "Waiting for product direction." });

    const completed = await startAgentRun(root, {
      id: "run-done",
      kind: "agent",
      agentId: "code-reviewer",
      agentName: "Code Reviewer",
      prompt: "review completed work",
    });
    completed.write("No blocking issues.");
    await completed.finish("done");

    const board = stripAnsi(await formatAgentBoard(root));

    assert.match(board, /Agent Board/u);
    assert.match(board, /Needs input/u);
    assert.match(board, /UX Reviewer/u);
    assert.match(board, /Waiting for product direction/u);
    assert.match(board, /Working/u);
    assert.match(board, /Security Reviewer/u);
    assert.match(board, /Scanning dependency manifests/u);
    assert.match(board, /Completed/u);
    assert.match(board, /Code Reviewer/u);
    assert.match(board, /No blocking issues/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatAgentBoard hides transient progress lines from run summaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-board-preview-"));
  try {
    const run = await startAgentRun(root, {
      id: "run-preview",
      kind: "agent",
      agentId: "code-reviewer",
      agentName: "Code Reviewer",
      prompt: "review completed work",
    });
    run.write("\u001B[2K⠋ Thinking deepseek/deepseek-v4-flash · mid\n");
    run.tool("read README.md");
    run.write("Final review: no blocking issues.");
    await run.finish("done");

    const board = stripAnsi(await formatAgentBoard(root));

    assert.match(board, /Final review: no blocking issues/u);
    assert.doesNotMatch(board, /Thinking deepseek/u);
    assert.doesNotMatch(board, /Tool read README/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agentViewLines renders a clean Claude-style running tab", () => {
  const view = stripAnsi(agentViewLines({
    agents: [],
    selectedIndex: 0,
    rows: [{
      id: "run-1",
      runId: "run-1",
      group: "working",
      status: "WORKING",
      name: "Code Reviewer",
      age: "8.0s",
      inboxCount: 0,
      summary: "Reviewing changed files.",
      prompt: "review this branch",
    }],
    tab: "running",
  }).join("\n"));

  assert.match(view, /Agents\s+Running\s+Library/u);
  assert.match(view, /working/u);
  assert.match(view, /Reviewing changed files/u);
  assert.match(view, /←\/→ to switch/u);
  assert.doesNotMatch(view, /Completed/u);
  assert.doesNotMatch(view, /Preview/u);
  assert.doesNotMatch(view, /Dispatch:/u);
});

test("agentViewLines renders a Claude-style library tab", () => {
  const view = stripAnsi(agentViewLines({
    agents: [{
      id: "code-reviewer",
      name: "Code Reviewer",
      summary: "Review changes.",
      model: "inherit",
      tools: ["read"],
      prompt: "Review code.",
      source: "built-in",
    }],
    rows: [],
    selectedIndex: 0,
    tab: "library",
  }).join("\n"));

  assert.match(view, /Create new agent/u);
  assert.match(view, /No agents found/u);
  assert.match(view, /Built-in \(always available\):/u);
  assert.match(view, /code-reviewer\s+·\s+inherit/u);
});

test("agentViewLines can clamp long inline library panels", () => {
  const lines = agentViewLines({
    agents: [
      { id: "reviewer", name: "Reviewer", summary: "Review changes.", model: "inherit", tools: ["read"], prompt: "Review.", source: "built-in" },
      { id: "security", name: "Security", summary: "Review security.", model: "inherit", tools: ["read"], prompt: "Secure.", source: "built-in" },
      { id: "ux", name: "UX", summary: "Review UX.", model: "inherit", tools: ["read"], prompt: "UX.", source: "built-in" },
    ],
    rows: [],
    selectedIndex: 0,
    tab: "library",
  }, 100, 8);

  assert.equal(lines.length, 8);
  assert.match(stripAnsi(lines.join("\n")), /…/u);
  assert.match(stripAnsi(lines[lines.length - 1] ?? ""), /Esc to close/u);
});

test("renderAgentView returns the cursor to the clear anchor after tall tabs", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const lineCount = renderAgentView({
      agents: [{
        id: "code-reviewer",
        name: "Code Reviewer",
        summary: "Review changes.",
        model: "inherit",
        tools: ["read"],
        prompt: "Review code.",
        source: "built-in",
      }],
      rows: [],
      selectedIndex: 0,
      tab: "library",
    });

    assert.equal(chunks.join("").endsWith(`\u001B[${lineCount - 2}A\r`), true);
  } finally {
    stdout.mock.restore();
  }
});
