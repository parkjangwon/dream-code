import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { createAgentMessages } from "../src/agent-runner.js";
import { loadContextDocs } from "../src/context-docs.js";

test("loadContextDocs discovers global and project rules documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-rules-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-rules-project-"));
  const previousClaudeConfigDir = process.env["CLAUDE_CONFIG_DIR"];
  try {
    process.env["CLAUDE_CONFIG_DIR"] = join(root, "missing-claude");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "AGENTS.md"), "Global constitution.", "utf8");
    await writeFile(join(project, "DESIGN.md"), "Project design system.", "utf8");

    const docs = await loadContextDocs({ configRoot: root, cwd: project, prompt: "Polish the TUI" });

    assert.equal(docs.rules.length, 1);
    assert.equal(docs.design.length, 1);
    assert.match(docs.rules[0]?.content ?? "", /Global constitution/u);
    assert.match(docs.design[0]?.content ?? "", /Project design system/u);
  } finally {
    restoreEnv("CLAUDE_CONFIG_DIR", previousClaudeConfigDir);
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("loadContextDocs discovers Claude Code memory and rule files", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-claude-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-claude-project-"));
  const previousClaudeConfigDir = process.env["CLAUDE_CONFIG_DIR"];
  try {
    process.env["CLAUDE_CONFIG_DIR"] = join(root, "missing-claude");
    await mkdir(join(project, ".claude", "rules"), { recursive: true });
    await writeFile(join(root, "CLAUDE.md"), "Global Claude memory.", "utf8");
    await writeFile(join(project, "CLAUDE.md"), "Project Claude memory.", "utf8");
    await writeFile(join(project, "CLAUDE.local.md"), "Local Claude memory.", "utf8");
    await writeFile(join(project, ".claude", "rules", "testing.md"), "Always test Claude rules.", "utf8");

    const docs = await loadContextDocs({ configRoot: root, cwd: project, prompt: "ship" });

    assert.equal(docs.rules.length, 4);
    assert.deepEqual(docs.rules.map((doc) => doc.label), [
      "global CLAUDE.md",
      "project CLAUDE.md",
      "project CLAUDE.local.md",
      "project .claude/rules/testing.md",
    ]);
  } finally {
    restoreEnv("CLAUDE_CONFIG_DIR", previousClaudeConfigDir);
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

test("createAgentMessages injects rules and design docs when relevant", () => {
  const messages = createAgentMessages("Improve the UI", [], undefined, {
    rules: [{ label: "project AGENTS.md", path: "/repo/AGENTS.md", content: "Always run tests." }],
    design: [{ label: "project DESIGN.md", path: "/repo/DESIGN.md", content: "Use calm terminal colors." }],
  });
  const system = messages[0]?.content ?? "";

  assert.match(system, /Dream Code project rules/u);
  assert.match(system, /Always run tests\./u);
  assert.match(system, /Dream Code design system/u);
  assert.match(system, /calm terminal colors/u);
});
