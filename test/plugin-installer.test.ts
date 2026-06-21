import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { installClaudePlugin } from "../src/plugin-installer.js";
import { loadPluginRecords } from "../src/plugin-registry.js";

test("installClaudePlugin imports Claude plugin capabilities", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-plugin-home-"));
  const pluginRoot = await mkdtemp(join(tmpdir(), "dream-plugin-source-"));
  try {
    await writeFixturePlugin(pluginRoot);

    const result = await installClaudePlugin(root, pluginRoot, process.cwd());

    assert.equal(result.record.name, "Claude Power Pack");
    assert.equal(result.record.skills, 1);
    assert.equal(result.record.agents, 1);
    assert.equal(result.record.commands, 1);
    assert.equal(result.record.mcpServers, 1);
    assert.match(await readFile(join(root, "skills", "claude-power-pack-review", "SKILL.md"), "utf8"), /Review code/u);
    assert.match(await readFile(join(root, "agents", "claude-power-pack-security.md"), "utf8"), /Security reviewer/u);
    assert.match(await readFile(join(root, "skills", "claude-power-pack-command-audit", "SKILL.md"), "utf8"), /Claude Command/u);
    assert.match(await readFile(join(root, "mcp.toml"), "utf8"), /claude-power-pack-local/u);
    assert.equal((await loadPluginRecords(root)).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(pluginRoot, { recursive: true, force: true });
  }
});

async function writeFixturePlugin(pluginRoot: string): Promise<void> {
  await mkdir(join(pluginRoot, ".claude-plugin"), { recursive: true });
  await mkdir(join(pluginRoot, "skills", "review"), { recursive: true });
  await mkdir(join(pluginRoot, "agents"), { recursive: true });
  await mkdir(join(pluginRoot, "commands"), { recursive: true });
  await writeFile(join(pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({
    name: "Claude Power Pack",
    version: "1.2.3",
    description: "Fixture plugin.",
  }), "utf8");
  await writeFile(join(pluginRoot, "skills", "review", "SKILL.md"), "---\nname: review\ndescription: Review code.\n---\n", "utf8");
  await writeFile(join(pluginRoot, "agents", "security.md"), "---\nname: security\n---\nSecurity reviewer.\n", "utf8");
  await writeFile(join(pluginRoot, "commands", "audit.md"), "Audit this repository.\n", "utf8");
  await writeFile(join(pluginRoot, ".mcp.json"), JSON.stringify({
    mcpServers: {
      local: {
        command: "node",
        args: ["server.js"],
      },
    },
  }), "utf8");
}
