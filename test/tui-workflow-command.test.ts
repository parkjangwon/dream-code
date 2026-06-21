import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { defaultConfig } from "../src/config.js";
import { runWorkspaceCommand } from "../src/tui-workspace-commands.js";

test("workflow command runs a workspace script", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workflow-command-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-workflow-command-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await writeFile(join(project, "flow.js"), `
      export default async function main({ writeFile, readFile }) {
        await writeFile("result.txt", "workflow ok");
        return await readFile("result.txt");
      }
    `, "utf8");

    await runWorkspaceCommand("/workflow flow.js", defaultConfig(), true, { question: async () => "" }, root, undefined, project);

    const outputText = stripAnsi(chunks.join(""));
    const runFiles = await readdir(join(root, "workflows", "runs"));
    const runRecord = JSON.parse(await readFile(join(root, "workflows", "runs", runFiles[0] ?? ""), "utf8"));
    assert.match(outputText, /Workflow/u);
    assert.match(outputText, /workflow done/u);
    assert.match(outputText, /workflow ok/u);
    assert.equal(runRecord.status, "done");
    assert.equal(runRecord.value, "workflow ok");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});
