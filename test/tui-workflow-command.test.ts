import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
    assert.match(outputText, /workflow trace/u);
    assert.match(outputText, /workflow ok/u);
    assert.equal(runRecord.status, "done");
    assert.equal(runRecord.value, "workflow ok");
    assert.equal(typeof runRecord.durationMs, "number");
    assert.equal(Array.isArray(runRecord.events), true);
    assert.equal(runRecord.events.some(hasWorkflowEventType("writeFile")), true);
    assert.equal(runRecord.events.some(hasWorkflowEventType("readFile")), true);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("workflow command opens a project workflow picker", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workflow-picker-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-workflow-picker-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await mkdir(join(project, ".dream", "workflows"), { recursive: true });
    await writeFile(join(project, ".dream", "workflows", "picked.js"), `
      export default async function main() {
        return "picked ok";
      }
    `, "utf8");

    await runWorkspaceCommand("/workflow", defaultConfig(), true, {
      question: async () => "",
      select: async (options) => {
        assert.equal(options.title, "Workflows");
        assert.equal(options.choices.some((choice) => choice.value === ".dream/workflows/picked.js"), true);
        return ".dream/workflows/picked.js";
      },
    }, root, undefined, project);

    const outputText = stripAnsi(chunks.join(""));
    assert.match(outputText, /picked ok/u);
    const runFiles = await readdir(join(root, "workflows", "runs"));
    const runRecord = JSON.parse(await readFile(join(root, "workflows", "runs", runFiles[0] ?? ""), "utf8"));
    assert.equal(runRecord.status, "done");
    assert.equal(runRecord.value, "picked ok");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("workflow command reports missing files without crashing", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workflow-missing-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-workflow-missing-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await runWorkspaceCommand("/workflow 프로젝트 고도화 전략 계획 수립", defaultConfig(), true, { question: async () => "" }, root, undefined, project);

    const outputText = stripAnsi(chunks.join(""));
    assert.match(outputText, /workflow not found/u);
    assert.match(outputText, /usage: \/workflow/u);
    assert.match(outputText, /saved JavaScript recipes/u);
    assert.match(outputText, /\/plan <request>/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

function hasWorkflowEventType(type: string): (event: unknown) => boolean {
  return (event) => {
    if (typeof event !== "object" || event === null) {
      return false;
    }
    return Object.getOwnPropertyDescriptor(event, "type")?.value === type;
  };
}
