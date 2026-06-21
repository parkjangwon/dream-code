import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { defaultConfig } from "../src/config.js";
import { writeProviderCredential } from "../src/credentials.js";
import { checkpointPath } from "../src/memory-store.js";
import { appendSessionTurn, startSession } from "../src/session-store.js";
import { compactCurrentSession, copyLastAssistantResponse, formatCompactContext } from "../src/session-actions.js";
import { runWorkspaceCommand } from "../src/tui-workspace-commands.js";

test("utility commands show rules, compact, export, and logout state", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-utility-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-utility-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await writeFile(join(project, "AGENTS.md"), "Project rules.", "utf8");
    await writeProviderCredential(root, "deepseek", { apiKey: "secret" });
    const session = await startSession(root, project);
    await appendSessionTurn(root, session.id, "user", "Build a plan");
    await appendSessionTurn(root, session.id, "assistant", "Done.");
    const runtime = { currentId: () => session.id, switchTo: () => undefined };

    await runWorkspaceCommand("/rules", defaultConfig(), true, { question: async () => "" }, root, runtime, project);
    await runWorkspaceCommand("/compact", defaultConfig(), true, { question: async () => "" }, root, runtime, project);
    await runWorkspaceCommand("/export", defaultConfig(), true, { question: async () => "" }, root, runtime, project);
    await runWorkspaceCommand("/logout deepseek", defaultConfig(), true, { question: async () => "" }, root, runtime, project);

    const outputText = stripAnsi(chunks.join(""));
    assert.match(outputText, /Rules/u);
    assert.match(outputText, /Project rules/u);
    assert.match(outputText, /compacting session context/u);
    assert.match(outputText, /compact failed:/u);
    assert.match(outputText, /exported:/u);
    assert.match(outputText, /logged out: deepseek/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("add-dir and tasks persist lightweight workspace state", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workspace-state-"));
  const project = await mkdtemp(join(tmpdir(), "dream-workspace-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "artifacts", "note.md"), "# Artifact", "utf8");

    const extraDir = join(project, "packages", "mobile");
    await runWorkspaceCommand("/add-dir", defaultConfig(), true, { question: async () => extraDir }, root, undefined, project);
    await runWorkspaceCommand("/tasks", defaultConfig(), true, { question: async () => "" }, root, undefined, project);
    await runWorkspaceCommand("/tasks Polish command UX", defaultConfig(), true, { question: async () => "" }, root, undefined, project);
    await runWorkspaceCommand("/artifact", defaultConfig(), true, { question: async () => "" }, root, undefined, project);
    await runWorkspaceCommand("/mcp", defaultConfig(), true, { question: async () => "" }, root, undefined, project);
    await runWorkspaceCommand("/hooks", defaultConfig(), true, { question: async () => "" }, root, undefined, project);

    const state = await readFile(join(root, "workspace.toml"), "utf8");
    const extraDirStat = await stat(extraDir);
    const outputText = stripAnsi(chunks.join(""));
    assert.match(state, /paths = \[/u);
    assert.equal(extraDirStat.isDirectory(), true);
    assert.match(outputText, /Tasks/u);
    assert.match(outputText, /No tasks yet/u);
    assert.match(outputText, /Task: Polish command UX/u);
    assert.match(outputText, /Artifacts/u);
    assert.match(outputText, /note\.md/u);
    assert.match(outputText, /mcp\.toml/u);
    assert.match(outputText, /No hooks configured/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("tasks command updates task status through the ledger", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tasks-command-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    await runWorkspaceCommand("/tasks Polish the dashboard", defaultConfig(), true, { question: async () => "" }, root);
    await runWorkspaceCommand("/tasks done T001", defaultConfig(), true, { question: async () => "" }, root);

    const ledger = await readFile(join(root, "tasks.jsonl"), "utf8");

    assert.match(ledger, /"id":"T001"/u);
    assert.match(ledger, /"status":"done"/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("plan and goal commands save workflow notes before model execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-workflow-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-workflow-project-"));
  const stdout = mock.method(process.stdout, "write", () => true);
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

    await runWorkspaceCommand("/goal Ship the harness", config, true, { question: async () => "" }, root, undefined, project);
    await runWorkspaceCommand("/goal", config, true, { question: async () => "" }, root, undefined, project);
    await runWorkspaceCommand("/plan Implement tool loop", config, true, { question: async () => "" }, root, undefined, project);

    const tasks = await readFile(join(root, "tasks.md"), "utf8");
    const goals = await readFile(join(root, "goals.md"), "utf8");
    const plans = await readFile(join(root, "plans.md"), "utf8");
    const projectPlans = await readFile(join(project, ".dream", "plans.md"), "utf8");
    assert.match(tasks, /Goal: Ship the harness/u);
    assert.match(tasks, /Plan: Implement tool loop/u);
    assert.match(goals, /Ship the harness/u);
    assert.match(plans, /Implement tool loop/u);
    assert.match(projectPlans, /Implement tool loop/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("interview command stops immediately when prompt input is cancelled", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-interview-cancel-"));
  const project = await mkdtemp(join(tmpdir(), "dream-interview-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    let calls = 0;
    await runWorkspaceCommand(
      "/interview",
      defaultConfig(),
      true,
      {
        question: async () => {
          calls += 1;
          return "";
        },
        wasCancelled: () => true,
      },
      root,
      undefined,
      project,
    );

    assert.equal(calls, 1);
    assert.equal(stripAnsi(chunks.join("")).includes("interview skipped"), false);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("copyLastAssistantResponse accepts nth latest assistant response", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-copy-nth-"));
  try {
    const session = await startSession(root, "/tmp/dream-copy");
    await appendSessionTurn(root, session.id, "assistant", "first answer");
    await appendSessionTurn(root, session.id, "assistant", "second answer");

    const result = await copyLastAssistantResponse(root, session.id, 3);

    assert.equal(result, "copy skipped: no assistant response");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatCompactContext loads the saved session compact", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-compact-context-"));
  try {
    const session = await startSession(root, "/tmp/dream-compact");
    await appendSessionTurn(root, session.id, "user", "Build everything");
    await appendSessionTurn(root, session.id, "assistant", "A compact-worthy answer.");
    await compactCurrentSession(root, session.id, {
      summarizer: async (input) => [
        "# Dream Context Compact",
        "",
        "## Objective",
        input.title,
        "",
        "## Decisions",
        "- Keep the TUI fast.",
        "",
        "## Next Actions",
        "- Continue implementation.",
      ].join("\n"),
    });

    const context = await formatCompactContext(root, session.id);
    const checkpoint = await readFile(checkpointPath(root, "/tmp/dream-compact", session.id), "utf8");

    assert.match(context, /Session compact/u);
    assert.match(context, /Dream Context Compact/u);
    assert.match(context, /Keep the TUI fast/u);
    assert.match(checkpoint, /Continue implementation/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
