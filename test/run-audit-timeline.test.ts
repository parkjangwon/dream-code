import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { formatAgentRunShow, formatAgentRunShowJson } from "../src/agent-run-history.js";
import { startAgentRun } from "../src/agent-run-store.js";

test("formatAgentRunShow renders a human timeline with risk, recovery, and resume guidance", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-run-timeline-"));
  try {
    const run = await startAgentRun(root, {
      id: "run-timeline",
      kind: "agent",
      agentId: "dream",
      agentName: "Dream",
      prompt: "audit timeline",
    });
    run.tool("edit src/index.ts", {
      ok: false,
      durationMs: 33,
      batchId: "batch-2",
      sequence: 2,
      risk: "workspace-write",
      recovery: "Approve the edit or request a non-mutating plan.",
      failureClass: "permission",
      nextAction: "Open the diff preview before retrying.",
    });
    await run.finish("failed", { error: "Permission required." });

    const text = await formatAgentRunShow(root, "latest");
    const json = JSON.parse(await formatAgentRunShowJson(root, "latest")) as {
      readonly telemetry?: { readonly tools?: readonly { readonly failureClass?: string; readonly nextAction?: string }[] };
    };

    assert.match(text, /Timeline/u);
    assert.match(text, /edit src\/index\.ts/u);
    assert.match(text, /risk workspace-write/u);
    assert.match(text, /batch-2/u);
    assert.match(text, /failure permission/u);
    assert.match(text, /Resume/u);
    assert.equal(json.telemetry?.tools?.[0]?.failureClass, "permission");
    assert.equal(json.telemetry?.tools?.[0]?.nextAction, "Open the diff preview before retrying.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
