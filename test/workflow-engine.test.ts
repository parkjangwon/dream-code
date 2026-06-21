import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runWorkflowScript, type WorkflowAgentOptions } from "../src/workflow-engine.js";

test("workflow engine runs agent, parallel, and pipeline primitives deterministically", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workflow-"));
  try {
    const result = await runWorkflowScript({
      root,
      workspace: root,
      script: `
        export const meta = { name: "review-flow", description: "Review files" };
        export default async function main({ agent, parallel, pipeline, readFile, writeFile }) {
          await writeFile("a.txt", "hello");
          const content = await readFile("a.txt");
          const lanes = await parallel([
            () => agent("review " + content, { name: "Reviewer" }),
            () => agent("audit " + content, { name: "Auditor" })
          ]);
          return pipeline(lanes, (item) => item.toUpperCase());
        }
      `,
      runAgent: async (prompt: string, options: WorkflowAgentOptions) => `${options.name}:${prompt}`,
    });

    assert.equal(result.status, "done");
    assert.deepEqual(result.value, ["REVIEWER:REVIEW HELLO", "AUDITOR:AUDIT HELLO"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow engine jails file primitives to the workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workflow-jail-"));
  try {
    await writeFile(join(root, "safe.txt"), "ok", "utf8");
    const result = await runWorkflowScript({
      root,
      workspace: root,
      script: `
        export const meta = { name: "jail", description: "Jail check" };
        export default async function main({ readFile }) {
          return [await readFile("safe.txt"), await readFile("../outside.txt")];
        }
      `,
      runAgent: async () => "unused",
    });

    assert.equal(result.status, "done");
    assert.deepEqual(result.value, ["ok", null]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
