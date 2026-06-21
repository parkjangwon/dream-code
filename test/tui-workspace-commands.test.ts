import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { registerActor } from "../src/actor-store.js";
import { defaultConfig, loadConfig } from "../src/config.js";
import { writeProviderCredential } from "../src/credentials.js";
import { drainInboxMessages } from "../src/inbox-store.js";
import { apiKeyEnvKeys, listProviderDefinitions } from "../src/provider-registry.js";
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

test("runWorkspaceCommand routes /auto to automatic model routing", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-auto-"));
  const chunks: string[] = [];
  const restoreEnv = clearEnvKeys(allProviderApiKeyEnvKeys());
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await writeProviderCredential(root, "deepseek", {
      apiKey: "sk-deepseek",
      region: "global",
      baseUrl: "https://api.deepseek.com",
    });
    const result = await runWorkspaceCommand(
      "/auto",
      defaultConfig(),
      true,
      { question: async () => "" },
      root,
    );
    const saved = await loadConfig(root);

    assert.equal(result.config.model.mode, "auto");
    assert.equal(saved.model.mode, "auto");
    assert.match(stripAnsi(chunks.join("")), /auto mode:/u);
  } finally {
    stdout.mock.restore();
    restoreEnv();
    await rm(root, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand fires postCommand hooks", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-hook-"));
  const outputPath = join(root, "hook-command.txt");
  const previous = process.env["DREAM_HOOK_OUT"];
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    process.env["DREAM_HOOK_OUT"] = outputPath;
    await writeFile(join(root, "hooks.toml"), [
      "[[hook]]",
      "event = \"postCommand\"",
      "command = node -e 'require(\"node:fs\").writeFileSync(process.env.DREAM_HOOK_OUT, process.env.DREAM_COMMAND)'",
      "enabled = true",
    ].join("\n"), "utf8");

    await runWorkspaceCommand("/tasks", defaultConfig(), true, { question: async () => "" }, root);

    assert.equal(await readFile(outputPath, "utf8"), "/tasks");
  } finally {
    stdout.mock.restore();
    if (previous === undefined) {
      delete process.env["DREAM_HOOK_OUT"];
    } else {
      process.env["DREAM_HOOK_OUT"] = previous;
    }
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

test("runWorkspaceCommand queues inbox messages for running agents", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-agent-inbox-"));
  const projectRoot = await mkdtemp(join(tmpdir(), "dream-workspace-project-inbox-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const actor = await registerActor(root, {
      id: "actor-running",
      role: "subagent",
      name: "Security Reviewer",
      task: "Audit the repository",
      runId: "run-security",
    });
    const selections = ["running", actor.id];

    await runWorkspaceCommand(
      "/agents",
      defaultConfig(),
      true,
      {
        question: async () => "Check dependency risk too.",
        select: async () => selections.shift(),
      },
      root,
      undefined,
      projectRoot,
    );

    const messages = await drainInboxMessages(root, actor.id);
    assert.equal(messages[0]?.content, "Check dependency risk too.");
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

function clearEnvKeys(keys: readonly string[]): () => void {
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function allProviderApiKeyEnvKeys(): readonly string[] {
  return [...new Set(listProviderDefinitions().flatMap(apiKeyEnvKeys))];
}
