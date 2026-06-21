import { ansi, paint } from "./ansi.js";
import { listConfiguredMcpTools } from "./mcp-client.js";
import { formatMcpStatus, loadMcpServers } from "./mcp-config.js";

export async function formatLiveMcpContext(root: string, signal?: AbortSignal): Promise<string> {
  const servers = (await loadMcpServers(root)).filter((server) => server.enabled);
  if (servers.length === 0) {
    return "MCP servers: none configured.";
  }
  const tools = await listConfiguredMcpTools(root, signal);
  if (tools.length === 0) {
    return [
      "MCP servers configured, but no tools are currently available.",
      ...servers.map((server) => `- ${server.name}: ${server.command} ${server.args.join(" ")}`.trim()),
      "Use MCP only after the server exposes tools successfully.",
    ].join("\n");
  }
  return [
    "MCP tools available:",
    ...tools.map((tool) => {
      const description = tool.description.length === 0 ? "" : ` - ${tool.description}`;
      return `- ${tool.server}/${tool.name}${description}`;
    }),
    "To call an MCP tool, emit a dream-tool JSON line like:",
    "{\"tool\":\"mcp\",\"server\":\"server-name\",\"name\":\"tool-name\",\"arguments\":{}}",
  ].join("\n");
}

export async function formatMcpRuntimeStatus(root: string, signal?: AbortSignal): Promise<string> {
  const base = await formatMcpStatus(root);
  const servers = (await loadMcpServers(root)).filter((server) => server.enabled);
  if (servers.length === 0) {
    return base;
  }
  const tools = await listConfiguredMcpTools(root, signal);
  if (tools.length === 0) {
    return [
      base,
      paint("No live MCP tools discovered.", ansi.yellow),
      paint("Check that the configured commands start an MCP stdio server.", ansi.dim),
    ].join("\n");
  }
  return [
    base,
    paint("Live tools", `${ansi.bold}${ansi.muted}`),
    ...tools.map((tool) => `${paint(tool.server, ansi.blue)}/${paint(tool.name, ansi.green)} ${paint(tool.description, ansi.dim)}`.trim()),
  ].join("\n");
}
