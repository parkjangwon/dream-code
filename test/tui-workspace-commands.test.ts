import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { defaultConfig, loadConfig } from "../src/config.js";
import { listSessions, startSession } from "../src/session-store.js";
import { loadSkillSettings } from "../src/skill-settings.js";
import { runWorkspaceCommand } from "../src/tui-workspace-commands.js";

test("runWorkspaceCommand routes /model to model configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-command-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const result = await runWorkspaceCommand(
      "/model high",
      defaultConfig(),
      true,
      { question: async () => "" },
      root,
    );
    const saved = await loadConfig(root);

    assert.equal(result.config.model.single.defaultTier, "high");
    assert.equal(saved.model.single.defaultTier, "high");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand stores user and assistant turns in the active session", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-session-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const session = await startSession(root, "/tmp/dream-code");
    const baseConfig = defaultConfig();
    const config = {
      ...baseConfig,
      model: {
        ...baseConfig.model,
        single: {
          ...baseConfig.model.single,
          provider: "unknown-provider",
        },
      },
    };
    await runWorkspaceCommand(
      "What is this project?",
      config,
      true,
      { question: async () => "" },
      root,
      {
        currentId: () => session.id,
        switchTo: () => undefined,
      },
    );
    const sessions = await listSessions(root);

    assert.equal(sessions[0]?.summary, "What is this project?");
    assert.equal(sessions[0]?.turns[0]?.role, "user");
    assert.equal(sessions[0]?.turns[1]?.role, "assistant");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand lists installed skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-skills-"));
  const originalHome = process.env["HOME"];
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    process.env["HOME"] = root;
    const skillDir = join(root, ".dream", "skills", "review");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: review\ndescription: Review code.\n---\nFind bugs.", "utf8");

    await runWorkspaceCommand(
      "/skills",
      defaultConfig(),
      true,
      { question: async () => "" },
      root,
    );

    const outputText = chunks.join("");
    assert.match(outputText, /Skills/u);
    assert.match(outputText, /@.*review/u);
    assert.match(outputText, /Review code\./u);
  } finally {
    stdout.mock.restore();
    if (originalHome === undefined) {
      delete process.env["HOME"];
    } else {
      process.env["HOME"] = originalHome;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand toggles skills through the menu", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-skill-toggle-"));
  const originalHome = process.env["HOME"];
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    process.env["HOME"] = root;
    const skillDir = join(root, ".dream", "skills", "review");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: review\ndescription: Review code.\n---\nFind bugs.", "utf8");
    const selections = ["toggle", "review"];

    await runWorkspaceCommand(
      "/skills",
      defaultConfig(),
      true,
      {
        question: async () => "",
        select: async () => selections.shift(),
      },
      root,
    );

    assert.deepEqual((await loadSkillSettings(root)).disabled, ["review"]);
  } finally {
    stdout.mock.restore();
    if (originalHome === undefined) {
      delete process.env["HOME"];
    } else {
      process.env["HOME"] = originalHome;
    }
    await rm(root, { recursive: true, force: true });
  }
});
