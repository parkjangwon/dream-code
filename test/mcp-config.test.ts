import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { formatMcpStatus, formatMcpServersForPrompt, formatMcpTrustSummary, loadMcpServers } from "../src/mcp-config.js";
import { stripAnsi } from "../src/ansi.js";

test("loadMcpServers parses TOML server blocks", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-mcp-"));
  try {
    await writeFile(join(root, "mcp.toml"), [
      "[[server]]",
      "name = \"filesystem\"",
      "command = \"npx\"",
      "args = [\"-y\", \"@modelcontextprotocol/server-filesystem\"]",
      "enabled = true",
    ].join("\n"), "utf8");

    const servers = await loadMcpServers(root);

    assert.equal(servers[0]?.name, "filesystem");
    assert.deepEqual(servers[0]?.args, ["-y", "@modelcontextprotocol/server-filesystem"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatMcpStatus and prompt context describe configured servers", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-mcp-status-"));
  try {
    await writeFile(join(root, "mcp.toml"), [
      "[[server]]",
      "name = \"github\"",
      "command = \"github-mcp\"",
      "enabled = true",
    ].join("\n"), "utf8");

    const status = stripAnsi(await formatMcpStatus(root));
    const prompt = await formatMcpServersForPrompt(root);

    assert.match(status, /github/u);
    assert.match(prompt, /MCP servers/u);
    assert.match(prompt, /github-mcp/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatMcpStatus redacts sensitive command arguments and states trust boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-mcp-redact-"));
  try {
    await writeFile(join(root, "mcp.toml"), [
      "[[server]]",
      "name = \"secret-server\"",
      "command = \"node\"",
      "args = [\"server.js\", \"--api-key=super-secret-token\"]",
      "enabled = true",
    ].join("\n"), "utf8");

    const status = stripAnsi(await formatMcpStatus(root));
    const prompt = await formatMcpServersForPrompt(root);

    assert.match(status, /Trust boundary/u);
    assert.match(status, /\[redacted\]/u);
    assert.doesNotMatch(status, /super-secret-token/u);
    assert.match(prompt, /untrusted external content/u);
    assert.doesNotMatch(prompt, /super-secret-token/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatMcpTrustSummary redacts secret-looking arguments", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-mcp-trust-"));
  try {
    await writeFile(join(root, "mcp.toml"), [
      "[[server]]",
      "name = \"danger\"",
      "command = \"node\"",
      "args = [\"server.js\", \"--token=sk-live-secret\"]",
      "enabled = true",
    ].join("\n"), "utf8");

    const summary = stripAnsi(await formatMcpTrustSummary(root));

    assert.match(summary, /Trust summary/u);
    assert.match(summary, /danger/u);
    assert.doesNotMatch(summary, /sk-live-secret/u);
    assert.match(summary, /\[redacted\]/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
