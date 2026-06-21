import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execPath } from "node:process";
import assert from "node:assert/strict";
import test from "node:test";

import { callConfiguredMcpTool, listConfiguredMcpTools } from "../src/mcp-client.js";
import { formatMcpRuntimeStatus } from "../src/mcp-context.js";
import { stripAnsi } from "../src/ansi.js";

test("MCP client lists tools and calls a configured stdio server", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-mcp-client-"));
  try {
    const serverPath = join(root, "server.js");
    await writeFile(serverPath, fakeMcpServerSource(), "utf8");
    await writeFile(join(root, "mcp.toml"), [
      "[[server]]",
      "name = \"fake\"",
      `command = "${execPath}"`,
      `args = ["${serverPath.replaceAll("\\", "\\\\")}"]`,
      "enabled = true",
    ].join("\n"), "utf8");

    const tools = await listConfiguredMcpTools(root);
    const output = await callConfiguredMcpTool(root, {
      server: "fake",
      name: "echo",
      arguments: { text: "hello mcp" },
    });
    const status = stripAnsi(await formatMcpRuntimeStatus(root));

    assert.equal(tools[0]?.server, "fake");
    assert.equal(tools[0]?.name, "echo");
    assert.equal(output, "hello mcp");
    assert.match(status, /Live tools/u);
    assert.match(status, /fake\/echo/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function fakeMcpServerSource(): string {
  return String.raw`
let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const end = buffer.indexOf("\r\n\r\n");
    if (end < 0) return;
    const header = buffer.subarray(0, end).toString("ascii");
    const match = /^Content-Length:\s*(\d+)$/imu.exec(header);
    if (!match) throw new Error("missing length");
    const length = Number.parseInt(match[1], 10);
    const start = end + 4;
    const stop = start + length;
    if (buffer.length < stop) return;
    const message = JSON.parse(buffer.subarray(start, stop).toString("utf8"));
    buffer = buffer.subarray(stop);
    handle(message);
  }
});

function send(payload) {
  const body = JSON.stringify(payload);
  process.stdout.write("Content-Length: " + Buffer.byteLength(body, "utf8") + "\r\n\r\n" + body);
}

function handle(message) {
  if (message.id === undefined) return;
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: {} } });
    return;
  }
  if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "echo", description: "Echo text" }] } });
    return;
  }
  if (message.method === "tools/call") {
    send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: message.params.arguments.text }] } });
  }
}
`;
}
