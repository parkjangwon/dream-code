import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  formatAgentRunDiff,
  formatAgentRunShow,
  revertAgentRun,
} from "../src/agent-run-history.js";
import { listAgentRuns, startAgentRun } from "../src/agent-run-store.js";
import { saveFileCheckpoint } from "../src/file-history.js";

test("agent run history records tool checkpoints and reverts a run", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-run-history-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-run-history-project-"));
  try {
    await mkdir(join(project, "src"), { recursive: true });
    const filePath = join(project, "src", "index.ts");
    await writeFile(filePath, "before\n", "utf8");
    const checkpoint = await saveFileCheckpoint("src/index.ts", project, root);
    assert.notEqual(checkpoint, undefined);
    await writeFile(filePath, "after\n", "utf8");

    const run = await startAgentRun(root, {
      id: "run-history",
      kind: "agent",
      agentId: "dream",
      agentName: "Dream",
      prompt: "edit file",
    });
    run.tool("edit src/index.ts", {
      ok: true,
      changedPath: filePath,
      checkpoints: [checkpoint],
    });
    await run.finish("done");

    const records = await listAgentRuns(root);
    assert.deepEqual(records[0]?.changedFiles, [filePath]);
    assert.equal(records[0]?.toolEvents[0]?.label, "edit src/index.ts");
    assert.equal(records[0]?.checkpoints[0]?.path, "src/index.ts");
    assert.match(await formatAgentRunShow(root, "latest"), /src\/index\.ts/u);
    assert.match(await formatAgentRunDiff(root, "latest", project), /-before/u);
    assert.match(await formatAgentRunDiff(root, "latest", project), /\+after/u);

    const reverted = await revertAgentRun(root, "latest", project);

    assert.match(reverted, /reverted run-history/u);
    assert.equal(await readFile(filePath, "utf8"), "before\n");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});
