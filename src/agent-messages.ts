import { cwd } from "node:process";

import type { AgentDefinition } from "./agent-library.js";
import { formatContextDocsForPrompt, type ContextDocs } from "./context-docs.js";
import type { ChatMessage } from "./llm-provider.js";
import type { DreamSkill } from "./skills.js";

export function createAgentMessages(
  prompt: string,
  skills: readonly DreamSkill[] = [],
  agent?: AgentDefinition,
  contextDocs?: ContextDocs,
  workspaceDirs: readonly string[] = [],
  mcpContext = "MCP servers: none configured.",
  compactContext = "Session compact: none.",
  memoryContext = "Dream memory: none.",
  workspace = cwd(),
  recentMessages: readonly ChatMessage[] = [],
  mentionedContext = "Referenced files and directories: none.",
  routingContext = "Model routing context: route not selected yet.",
): readonly ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are Dream Code, a fast coding harness CLI.",
        "You are a trusted autonomous coding companion: prefer completion over clarification, and do not ask the user to babysit routine work.",
        "Infer carefully from the repository first; when a concept is unclear or likely current, use research before asking the user.",
        "Act in small reversible steps, preserve unrelated user work, verify before claiming success, and record important progress through tools and artifacts.",
        "Ask the user only when the next step is destructive, externally irreversible, secret-bearing, costly, or ambiguous in a high-impact product direction.",
        "Answer concisely, prefer actionable engineering steps, and mention files or commands when useful.",
        `Workspace: ${workspace}`,
        formatWorkspaceDirs(workspaceDirs),
        mcpContext,
        memoryContext,
        compactContext,
        mentionedContext,
        routingContext,
        formatContextDocsForPrompt(contextDocs ?? { rules: [], design: [] }),
        formatToolProtocol(),
        formatAgentProfile(agent),
        formatSelectedSkills(prompt, skills),
      ].join("\n"),
    },
    ...recentMessages,
    { role: "user", content: prompt },
  ];
}

function formatWorkspaceDirs(workspaceDirs: readonly string[]): string {
  if (workspaceDirs.length === 0) {
    return "Additional workspace directories: none.";
  }
  return ["Additional workspace directories:", ...workspaceDirs.map((directory) => `- ${directory}`)].join("\n");
}

function formatToolProtocol(): string {
  return [
    "Local tool protocol:",
    "When local project data is required, request tools in a fenced block named dream-tool.",
    "Never print bare tool JSON outside that fence.",
    "Each line must be one JSON object:",
    "{\"tool\":\"read\",\"path\":\"README.md\"}",
    "{\"tool\":\"read\",\"path\":\"src/file.ts\",\"startLine\":10,\"endLine\":40}",
    "{\"tool\":\"list\",\"path\":\"src\"}",
    "{\"tool\":\"search\",\"query\":\"TODO\",\"path\":\"src\"}",
    "{\"tool\":\"grep\",\"query\":\"TODO|FIXME\",\"path\":\"src\",\"regex\":true,\"glob\":\"**/*.ts\",\"contextLines\":2}",
    "{\"tool\":\"glob\",\"pattern\":\"src/**/*.ts\"}",
    "{\"tool\":\"research\",\"query\":\"official docs for ...\"}",
    "{\"tool\":\"fetch\",\"url\":\"https://example.com/doc\"}",
    "{\"tool\":\"diff\",\"path\":\"src/file.ts\"}",
    "{\"tool\":\"stat\",\"path\":\"README.md\"}",
    "{\"tool\":\"diagnostics\"}",
    "{\"tool\":\"mcp\",\"server\":\"server-name\",\"name\":\"tool-name\",\"arguments\":{}}",
    "{\"tool\":\"shell\",\"command\":\"npm test\"}",
    "{\"tool\":\"mkdir\",\"path\":\"src\"}",
    "{\"tool\":\"edit\",\"path\":\"file.ts\",\"search\":\"old\",\"replace\":\"new\"}",
    "{\"tool\":\"patch\",\"patch\":\"--- a/file.ts\\n+++ b/file.ts\\n@@ -1 +1 @@\\n-old\\n+new\\n\"}",
    "{\"tool\":\"move\",\"from\":\"old.ts\",\"to\":\"new.ts\"}",
    "{\"tool\":\"copy\",\"from\":\"template.md\",\"to\":\"draft.md\"}",
    "{\"tool\":\"artifact\",\"action\":\"write\",\"name\":\"report.md\",\"content\":\"text\"}",
    "{\"tool\":\"task\",\"action\":\"add\",\"label\":\"Task\",\"detail\":\"Do the work\"}",
    "{\"tool\":\"write\",\"path\":\"file.ts\",\"content\":\"text\"}",
    "{\"tool\":\"delete\",\"path\":\"file.ts\"}",
    "Use diagnostics/shell/mcp/mkdir/write/edit/patch/move/copy/artifact/task/delete only when permission mode allows it; otherwise explain the needed command.",
  ].join("\n");
}

function formatAgentProfile(agent: AgentDefinition | undefined): string {
  if (agent === undefined) {
    return "Active Dream Code subagent: none.";
  }
  return [
    "Active Dream Code subagent:",
    `- name: ${agent.name}`,
    `- id: ${agent.id}`,
    `- source: ${agent.source}`,
    `- model hint: ${agent.model}`,
    `- tools: ${agent.tools.join(", ")}`,
    `- mission: ${agent.summary}`,
    "Subagent instructions:",
    agent.prompt,
  ].join("\n");
}

function formatSelectedSkills(prompt: string, skills: readonly DreamSkill[]): string {
  const selected = selectedSkillsForPrompt(prompt, skills);
  if (selected.length === 0) {
    return "Available Dream Code skills: none active. Use /skill-name to activate one.";
  }
  return [
    "Available Dream Code skills:",
    ...selected.map((skill) => [
      `- ${skill.name}: ${skill.description}`,
      skill.body,
    ].join("\n")),
  ].join("\n");
}

function selectedSkillsForPrompt(prompt: string, skills: readonly DreamSkill[]): readonly DreamSkill[] {
  const requested = new Set([...prompt.matchAll(/(^|\s)\/([a-zA-Z0-9._-]+)(?=\s|$)/gu)].map((match) => match[2]?.toLowerCase()).filter(isString));
  if (requested.size === 0) {
    return [];
  }
  return skills.filter((skill) => requested.has(skill.name)).slice(0, 5);
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}
