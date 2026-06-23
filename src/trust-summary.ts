import type { McpServer } from "./mcp-config.js";
import type { PluginRecord } from "./plugin-registry.js";

const sensitivePattern = /(api[_-]?key|authorization|bearer|secret|token|password|passwd|credential)/iu;

export function redactSensitiveText(value: string): string {
  if (sensitivePattern.test(value)) {
    return "[redacted]";
  }
  return value;
}

export function formatCommandPreview(command: string, args: readonly string[]): string {
  return [redactSensitiveText(command), ...args.map(redactSensitiveText)].join(" ").trim();
}

export function formatMcpTrustSummary(servers: readonly McpServer[]): string {
  if (servers.length === 0) {
    return "Trust boundary: no MCP servers configured.";
  }
  return [
    "Trust boundary: MCP servers run local commands and their tool outputs are untrusted external content.",
    ...servers.map((server) => `- ${server.name}: ${server.enabled ? "enabled" : "disabled"} ${formatCommandPreview(server.command, server.args)}`),
  ].join("\n");
}

export function formatPluginTrustSummary(record: PluginRecord): string {
  const mcp = record.trust.mcpCommands.length === 0 ? "none" : record.trust.mcpCommands.join("; ");
  return `Trust summary: ${record.trust.commandSurfaces} imported command surface(s); MCP commands: ${mcp}`;
}
