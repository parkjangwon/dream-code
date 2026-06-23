import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    const listed = await runPluginCommand(root, "list", process.cwd());
    const installedList = await runPluginCommand(root, "installed", process.cwd());

    assert.match(installed, /plugin installed: Tiny Claude Plugin/u);
    assert.match(installed, /1 skill\(s\), 0 agent\(s\), 0 command\(s\), 0 MCP server\(s\)/u);
    assert.match(installed, /Trust summary/u);
    assert.match(listed, /Tiny Claude Plugin 0.1.0/u);
    assert.match(listed, /trust:/u);
    assert.match(installedList, /Tiny Claude Plugin 0.1.0/u);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(pluginRoot, { recursive: true, force: true });
  }
});

test("runPluginCommand uninstalls a plugin and removes imported capabilities", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tui-plugin-remove-home-"));
  const pluginRoot = await mkdtemp(join(tmpdir(), "dream-tui-plugin-remove-source-"));
  try {
    await writeFixturePlugin(pluginRoot, { agent: true, command: true, mcp: true });

    await runPluginCommand(root, `install ${pluginRoot}`, process.cwd());
    const removed = await runPluginCommand(root, "uninstall tiny-claude-plugin", process.cwd());
    const listed = await runPluginCommand(root, "", process.cwd());
    const mcpConfig = await readOptional(join(root, "mcp.toml"));

    assert.match(removed, /plugin uninstalled: Tiny Claude Plugin/u);
    assert.match(listed, /No plugins installed/u);
    await assert.rejects(readFile(join(root, "plugins", "tiny-claude-plugin", "source", ".claude-plugin", "plugin.json"), "utf8"), { code: "ENOENT" });
    await assert.rejects(readFile(join(root, "skills", "tiny-claude-plugin-tiny", "SKILL.md"), "utf8"), { code: "ENOENT" });
    await assert.rejects(readFile(join(root, "skills", "tiny-claude-plugin-command-audit", "SKILL.md"), "utf8"), { code: "ENOENT" });
    await assert.rejects(readFile(join(root, "agents", "tiny-claude-plugin-security.md"), "utf8"), { code: "ENOENT" });
    assert.doesNotMatch(mcpConfig ?? "", /tiny-claude-plugin-local/u);
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

test("runPluginCommand adds a marketplace from a Claude Code local directory source", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tui-market-home-"));
  const sourceRoot = await mkdtemp(join(tmpdir(), "dream-tui-market-source-"));
  const marketplaceRoot = await mkdtemp(join(tmpdir(), "dream-tui-marketplace-"));
  try {
    await writeFixturePlugin(sourceRoot);
    await mkdir(join(marketplaceRoot, ".claude-plugin"), { recursive: true });
    await writeFile(join(marketplaceRoot, ".claude-plugin", "marketplace.json"), JSON.stringify({
      name: "local-market",
      plugins: [{
        name: "tiny",
        description: "Tiny marketplace plugin.",
        source: sourceRoot,
      }],
    }), "utf8");

    const added = await runPluginCommand(root, `marketplace add ${marketplaceRoot}`, process.cwd());
    const searched = await runPluginCommand(root, "search tiny", process.cwd());
    const installed = await runPluginCommand(root, "install tiny@local-market", process.cwd());

    assert.match(added, /marketplace added: local-market/u);
    assert.match(searched, /tiny@local-market Tiny marketplace plugin\./u);
    assert.match(installed, /plugin installed: Tiny Claude Plugin/u);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(marketplaceRoot, { recursive: true, force: true });
  }
});

test("runPluginCommand removes saved marketplaces but keeps the official marketplace protected", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tui-market-remove-home-"));
  const marketplaceRoot = await mkdtemp(join(tmpdir(), "dream-tui-market-remove-source-"));
  try {
    const marketplacePath = join(marketplaceRoot, "marketplace.json");
    await writeFile(marketplacePath, JSON.stringify({
      name: "local-market",
      plugins: [],
    }), "utf8");

    await runPluginCommand(root, `marketplace add local ${marketplacePath}`, process.cwd());
    const removed = await runPluginCommand(root, "marketplace remove local", process.cwd());
    const protectedOutput = await runPluginCommand(root, "marketplace remove claude-plugins-official", process.cwd());
    const listed = await runPluginCommand(root, "marketplace", process.cwd());

    assert.match(removed, /marketplace removed: local/u);
    assert.match(protectedOutput, /marketplace remove skipped: claude-plugins-official is built in/u);
    assert.doesNotMatch(listed, /local\s+saved/u);
    assert.match(listed, /claude-plugins-official\s+builtin/u);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(marketplaceRoot, { recursive: true, force: true });
  }
});

test("runPluginCommand lists the Claude plugins official marketplace by its Claude Code name", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-tui-market-home-"));
  try {
    const marketplaces = await runPluginCommand(root, "marketplace list", process.cwd());

    assert.match(marketplaces, /claude-plugins-official\s+builtin/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

type FixturePluginOptions = {
  readonly agent?: boolean;
  readonly command?: boolean;
  readonly mcp?: boolean;
};

async function writeFixturePlugin(pluginRoot: string, options: FixturePluginOptions = {}): Promise<void> {
  await mkdir(join(pluginRoot, ".claude-plugin"), { recursive: true });
  await mkdir(join(pluginRoot, "skills", "tiny"), { recursive: true });
  await writeFile(join(pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({
    name: "Tiny Claude Plugin",
    version: "0.1.0",
  }), "utf8");
  await writeFile(join(pluginRoot, "skills", "tiny", "SKILL.md"), "---\nname: tiny\ndescription: Tiny skill.\n---\n", "utf8");
  if (options.agent === true) {
    await mkdir(join(pluginRoot, "agents"), { recursive: true });
    await writeFile(join(pluginRoot, "agents", "security.md"), "Security reviewer.\n", "utf8");
  }
  if (options.command === true) {
    await mkdir(join(pluginRoot, "commands"), { recursive: true });
    await writeFile(join(pluginRoot, "commands", "audit.md"), "Audit this repository.\n", "utf8");
  }
  if (options.mcp === true) {
    await writeFile(join(pluginRoot, ".mcp.json"), JSON.stringify({
      mcpServers: {
        local: {
          command: "node",
          args: ["server.js"],
        },
      },
    }), "utf8");
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
