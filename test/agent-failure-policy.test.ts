import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { formatAgentRunShowJson } from "../src/agent-run-history.js";
import { startAgentRun } from "../src/agent-run-store.js";

test("agent run tool events persist failure class and next action", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-failure-policy-"));
  try {
    const run = await startAgentRun(root, {
      id: "run-failure-policy",
      kind: "agent",
      agentId: "dream",
      agentName: "Dream",
      prompt: "recover from tool failure",
    });
    run.tool("shell npm test", {
      ok: false,
      risk: "external",
      failureClass: "retryable",
      nextAction: "Retry once with the smallest safe command, then inspect logs.",
      recovery: "Check tool configuration and retry with the smallest safe command.",
    });
    await run.finish("failed", { error: "Command timed out." });

    const parsed = JSON.parse(await formatAgentRunShowJson(root, "latest")) as {
      readonly telemetry?: { readonly tools?: readonly { readonly failureClass?: string; readonly nextAction?: string }[] };
    };

    assert.equal(parsed.telemetry?.tools?.[0]?.failureClass, "retryable");
    assert.match(parsed.telemetry?.tools?.[0]?.nextAction ?? "", /Retry once/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
