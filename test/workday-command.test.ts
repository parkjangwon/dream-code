import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { defaultConfig } from "../src/config.js";
import { slashCommands } from "../src/tui-commands.js";
import { runWorkspaceCommand } from "../src/tui-workspace-commands.js";

test("slash command registry lists workday readiness", () => {
  const workday = slashCommands.find((command) => command.name === workdayCommandName());

  assert.equal(workday?.acceptsArgs, true);
  assert.match(workday?.summary ?? "", /edit-test-review/u);
});

function workdayCommandName(): string {
  return "/workday";
}

test("workspace workday command prints readiness without starting an agent", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workday-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-workday-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await writeFile(join(project, "package.json"), JSON.stringify({ version: "1.2.3", scripts: { test: "node --test" } }), "utf8");

    const result = await runWorkspaceCommand(
      "/workday --dry-run",
      defaultConfig(),
      true,
      { question: async () => "" },
      root,
      undefined,
      project,
    );

    const output = stripAnsi(chunks.join(""));
    assert.equal(result.shouldContinue, true);
    assert.match(output, /Dream Workday/u);
    assert.match(output, /Mode/u);
    assert.match(output, /Diagnostics/u);
    assert.match(output, /current v1\.2\.3/u);
    assert.match(output, /Release/u);
    assert.doesNotMatch(output, /tag current/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("workspace workday command honors one-shot yolo mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workday-yolo-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-workday-yolo-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const config = defaultConfig();
    config.permissions.mode = "ask";

    await runWorkspaceCommand("/workday --dry-run", config, true, { question: async () => "" }, root, undefined, project);

    const output = stripAnsi(chunks.join(""));
    assert.match(output, /YOLO ON/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});
