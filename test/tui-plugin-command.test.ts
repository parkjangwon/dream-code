import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { runPluginCommand } from "../src/tui-plugin-command.js";

test("runPluginCommand installs and lists plugins", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tui-plugin-home-"));
  const pluginRoot = await mkdtemp(join(tmpdir(), "dream-tui-plugin-source-"));
  try {
    await writeFixturePlugin(pluginRoot);

    const installed = await runPluginCommand(root, `install ${pluginRoot}`, process.cwd());
    const listed = await runPluginCommand(root, "", process.cwd());

    assert.match(installed, /plugin installed: Tiny Claude Plugin/u);
    assert.match(installed, /1 skill\(s\), 0 agent\(s\), 0 command\(s\), 0 MCP server\(s\)/u);
    assert.match(listed, /Tiny Claude Plugin 0.1.0/u);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(pluginRoot, { recursive: true, force: true });
  }
});

test("runPluginCommand installs a plugin from a saved marketplace", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tui-market-home-"));
  const sourceRoot = await mkdtemp(join(tmpdir(), "dream-tui-market-source-"));
  const marketplaceRoot = await mkdtemp(join(tmpdir(), "dream-tui-marketplace-"));
  try {
    await writeFixturePlugin(sourceRoot);
    const marketplacePath = join(marketplaceRoot, "marketplace.json");
    await writeFile(marketplacePath, JSON.stringify({
      name: "local-market",
      plugins: [{
        name: "tiny",
        description: "Tiny marketplace plugin.",
        source: sourceRoot,
      }],
    }), "utf8");

    const added = await runPluginCommand(root, `marketplace add local ${marketplacePath}`, process.cwd());
    const searched = await runPluginCommand(root, "search tiny", process.cwd());
    const installed = await runPluginCommand(root, "install tiny@local", process.cwd());

    assert.match(added, /marketplace added: local/u);
    assert.match(searched, /tiny@local Tiny marketplace plugin\./u);
    assert.match(installed, /plugin installed: Tiny Claude Plugin/u);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(marketplaceRoot, { recursive: true, force: true });
  }
});

async function writeFixturePlugin(pluginRoot: string): Promise<void> {
  await mkdir(join(pluginRoot, ".claude-plugin"), { recursive: true });
  await mkdir(join(pluginRoot, "skills", "tiny"), { recursive: true });
  await writeFile(join(pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({
    name: "Tiny Claude Plugin",
    version: "0.1.0",
  }), "utf8");
  await writeFile(join(pluginRoot, "skills", "tiny", "SKILL.md"), "---\nname: tiny\ndescription: Tiny skill.\n---\n", "utf8");
}
