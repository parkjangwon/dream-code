import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { defaultConfig, loadConfig } from "../src/config.js";
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

    const outputText = stripAnsi(chunks.join(""));
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

test("runWorkspaceCommand saves skill manager changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-skill-save-"));
  const originalHome = process.env["HOME"];
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    process.env["HOME"] = root;
    const skillDir = join(root, ".dream", "skills", "review");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: review\ndescription: Review code.\n---\nFind bugs.", "utf8");
    await runWorkspaceCommand(
      "/skills",
      defaultConfig(),
      true,
      {
        question: async () => "",
        manageSkills: async () => ["review"],
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

test("runWorkspaceCommand discards cancelled skill manager changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-skill-cancel-"));
  const originalHome = process.env["HOME"];
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    process.env["HOME"] = root;
    const skillDir = join(root, ".dream", "skills", "review");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: review\ndescription: Review code.\n---\nFind bugs.", "utf8");

    await runWorkspaceCommand(
      "/skills",
      defaultConfig(),
      true,
      {
        question: async () => "",
        manageSkills: async () => undefined,
      },
      root,
    );

    assert.deepEqual((await loadSkillSettings(root)).disabled, []);
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

test("runWorkspaceCommand creates a project agent from a template", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-agent-"));
  const projectRoot = await mkdtemp(join(tmpdir(), "dream-workspace-project-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const selections = ["templates", "code-reviewer", "project"];

    await runWorkspaceCommand(
      "/agents",
      defaultConfig(),
      true,
      {
        question: async () => "",
        select: async () => selections.shift(),
      },
      root,
      undefined,
      projectRoot,
    );

    const created = await readFile(join(projectRoot, ".dream", "agents", "code-reviewer.md"), "utf8");
    assert.match(created, /displayName: Code Reviewer/u);
    assert.match(created, /Review changes for bugs/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand delegates a task to a selected agent", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-agent-run-"));
  const projectRoot = await mkdtemp(join(tmpdir(), "dream-workspace-project-run-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
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
    const selections = ["delegate", "code-reviewer"];

    await runWorkspaceCommand(
      "/agents",
      config,
      true,
      {
        question: async () => "Review the latest changes",
        select: async () => selections.shift(),
      },
      root,
      undefined,
      projectRoot,
    );

    const outputText = stripAnsi(chunks.join(""));
    assert.match(outputText, /Delegating to Code Reviewer/u);
    assert.match(outputText, /unknown provider/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand runs swarm fan-out separately from single agent delegation", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-swarm-"));
  const projectRoot = await mkdtemp(join(tmpdir(), "dream-workspace-swarm-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
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
      "/swarm --size 3 Build the swarm runtime",
      config,
      true,
      { question: async () => "" },
      root,
      undefined,
      projectRoot,
    );

    const outputText = stripAnsi(chunks.join(""));
    assert.match(outputText, /Dream Swarm/u);
    assert.match(outputText, /3 parallel agents/u);
    assert.match(outputText, /forced overdrive/u);
    assert.match(outputText, /Swarm Synthesis/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});
