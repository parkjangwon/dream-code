import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { defaultConfig } from "../src/config.js";
import { loadGoalState, startGoalState } from "../src/goal-state.js";
import { runWorkspaceCommand } from "../src/tui-workspace-commands.js";

test("runWorkspaceCommand saves a swarm artifact after fan-out", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-swarm-artifact-"));
  const projectRoot = await mkdtemp(join(tmpdir(), "dream-workspace-swarm-artifact-project-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    await mkdir(projectRoot, { recursive: true });
    const config = configWithUnknownProvider();

    await runWorkspaceCommand(
      "/swarm --size 2 Build the artifact trail",
      config,
      true,
      { question: async () => "" },
      root,
      undefined,
      projectRoot,
    );

    const artifacts = await readdir(join(root, "artifacts"));
    const reportName = artifacts.find((fileName) => fileName.startsWith("swarm-"));
    assert.notEqual(reportName, undefined);
    assert.match(await readFile(join(root, "artifacts", reportName ?? ""), "utf8"), /Dream Swarm Report/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand records active goal evidence after agent turns", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-goal-evidence-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    await startGoalState(root, "Finish the harness");

    await runWorkspaceCommand("Check current status", configWithUnknownProvider(), true, { question: async () => "" }, root);

    const goal = await loadGoalState(root);
    assert.match(goal?.evidence[0]?.note ?? "", /Answered: Check current status/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

function configWithUnknownProvider(): ReturnType<typeof defaultConfig> {
  const baseConfig = defaultConfig();
  return {
    ...baseConfig,
    model: {
      ...baseConfig.model,
      single: {
        ...baseConfig.model.single,
        provider: "unknown-provider",
      },
    },
  };
}
