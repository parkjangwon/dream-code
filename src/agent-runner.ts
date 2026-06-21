import { cwd } from "node:process";

import type { AgentDefinition } from "./agent-library.js";
import { defaultConfigRoot, type DreamConfig } from "./config.js";
import { formatContextDocsForPrompt, loadContextDocs, type ContextDocs } from "./context-docs.js";
import { loadCredentials } from "./credentials.js";
import { runHookEvent } from "./hooks.js";
import type { ProviderEnv } from "./llm-provider.js";
import { formatMcpServersForPrompt } from "./mcp-config.js";
import {
  extractAgentToolRequests,
  formatToolProgress,
  formatToolResults,
  runAgentToolRequest,
  type AgentToolResult,
} from "./agent-tools.js";
import {
  MissingProviderConfigError,
  ProviderProtocolError,
  ProviderRequestError,
  streamChatCompletion,
  type ChatMessage,
} from "./llm-provider.js";
import { recordModelTelemetry } from "./model-telemetry.js";
import { selectModelForPrompt } from "./model-routing.js";
import { listProviderDefinitions } from "./provider-registry.js";
import { loadSkillSettings, skillEnabled } from "./skill-settings.js";
import { loadSkills, type DreamSkill } from "./skills.js";
import { formatCompactContext } from "./session-actions.js";
import { createAgentResponseSession } from "./tui-agent-response.js";
import { providerConnectionSource } from "./tui-provider-status.js";
import { loadWorkspaceDirs } from "./workspace-state.js";

export type AgentPromptOptions = {
  readonly config: DreamConfig;
  readonly configRoot?: string;
  readonly prompt: string;
  readonly agent?: AgentDefinition;
  readonly sessionId?: string;
  readonly signal?: AbortSignal;
  readonly write: (text: string) => void;
};

const maxToolCycles = 3;

export async function runAgentPrompt(options: AgentPromptOptions): Promise<void> {
  const configRoot = options.configRoot ?? defaultConfigRoot();
  const selectedModel = selectModelForPrompt(options.config.model, options.prompt, tierForAgent(options.agent), {
    connectedProviders: await connectedProviderIds(configRoot, process.env),
  });
  const settings = await loadSkillSettings(configRoot);
  const skills = (await loadSkills()).filter((skill) => skillEnabled(settings, skill.name));
  const contextDocs = await loadContextDocs({ configRoot, cwd: cwd(), prompt: options.prompt });
  const workspaceDirs = await loadWorkspaceDirs(configRoot);
  const mcpContext = await formatMcpServersForPrompt(configRoot);
  const compactContext = await formatCompactContext(configRoot, options.sessionId);
  let messages = createAgentMessages(options.prompt, skills, options.agent, contextDocs, workspaceDirs, mcpContext, compactContext);

  try {
    for (let cycle = 0; cycle < maxToolCycles; cycle += 1) {
      const assistantText = await streamAgentOnce(options, selectedModel, messages);
      const requests = extractAgentToolRequests(assistantText);
      if (requests.length === 0) {
        return;
      }
      const results: AgentToolResult[] = [];
      for (const request of requests) {
        await runHookEvent(configRoot, "preTool", { tool: request.tool });
        const result = await runAgentToolRequest(request, options.config.permissions.mode);
        await runHookEvent(configRoot, "postTool", { tool: request.tool, ok: String(result.ok) });
        options.write(formatToolProgress(result));
        results.push(result);
      }
      messages = [
        ...messages,
        { role: "assistant", content: assistantText },
        { role: "user", content: formatToolResults(results) },
      ];
    }
  } catch (error) {
    if (error instanceof MissingProviderConfigError) {
      writeAgentFailure(options, selectedModel, error.message, "warn");
      return;
    }
    if (error instanceof ProviderRequestError || error instanceof ProviderProtocolError) {
      writeAgentFailure(options, selectedModel, error.message, "error");
      return;
    }
    throw error;
  }
}

async function connectedProviderIds(root: string, env: ProviderEnv): Promise<ReadonlySet<string>> {
  const credentials = await loadCredentials(root);
  return new Set(listProviderDefinitions()
    .filter((definition) => providerConnectionSource(definition, credentials.providers[definition.id], env) !== "missing")
    .map((definition) => definition.id));
}

function writeAgentFailure(
  options: AgentPromptOptions,
  selectedModel: ReturnType<typeof selectModelForPrompt>,
  message: string,
  tone: "warn" | "error",
): void {
  createAgentResponseSession({ selectedModel, write: options.write }).fail(message, tone);
}

async function streamAgentOnce(
  options: AgentPromptOptions,
  selectedModel: ReturnType<typeof selectModelForPrompt>,
  messages: readonly ChatMessage[],
): Promise<string> {
  const response = createAgentResponseSession({ selectedModel, write: options.write });
  let assistantText = "";
  const startedAt = Date.now();
  const configRoot = options.configRoot ?? defaultConfigRoot();
  response.start();
  const onToken = (token: string): void => {
    assistantText = `${assistantText}${token}`;
    response.token(token);
  };
  try {
    await streamChatCompletion(optionalSignal({ selectedModel, messages, configRoot, onToken }, options.signal));
    response.finish();
    await recordModelTelemetry(configRoot, modelTelemetryInput(selectedModel, true, startedAt, messages, assistantText));
    return assistantText;
  } catch (error) {
    await recordModelTelemetry(configRoot, {
      ...modelTelemetryInput(selectedModel, false, startedAt, messages, assistantText),
      error: error instanceof Error ? error.message : "Unknown provider failure",
    });
    throw error;
  }
}

function modelTelemetryInput(
  selectedModel: ReturnType<typeof selectModelForPrompt>,
  ok: boolean,
  startedAt: number,
  messages: readonly ChatMessage[],
  assistantText: string,
): Parameters<typeof recordModelTelemetry>[1] {
  return {
    provider: selectedModel.provider,
    model: selectedModel.model,
    ...(selectedModel.category === undefined ? {} : { category: selectedModel.category }),
    ok,
    elapsedMs: Date.now() - startedAt,
    inputChars: messageChars(messages),
    outputChars: assistantText.length,
  };
}

export function createAgentMessages(
  prompt: string,
  skills: readonly DreamSkill[] = [],
  agent?: AgentDefinition,
  contextDocs?: ContextDocs,
  workspaceDirs: readonly string[] = [],
  mcpContext = "MCP servers: none configured.",
  compactContext = "Session compact: none.",
): readonly ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are Dream Code, a fast coding harness CLI.",
        "Answer concisely, prefer actionable engineering steps, and mention files or commands when useful.",
        `Workspace: ${cwd()}`,
        formatWorkspaceDirs(workspaceDirs),
        mcpContext,
        compactContext,
        formatContextDocsForPrompt(contextDocs ?? { rules: [], design: [] }),
        formatToolProtocol(),
        formatAgentProfile(agent),
        formatSelectedSkills(prompt, skills),
      ].join("\n"),
    },
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
    "Each line must be one JSON object:",
    "{\"tool\":\"read\",\"path\":\"README.md\"}",
    "{\"tool\":\"research\",\"query\":\"official docs for ...\"}",
    "{\"tool\":\"shell\",\"command\":\"pnpm test\"}",
    "{\"tool\":\"edit\",\"path\":\"file.ts\",\"search\":\"old\",\"replace\":\"new\"}",
    "{\"tool\":\"write\",\"path\":\"file.ts\",\"content\":\"text\"}",
    "Use shell/write/edit only when permission mode allows it; otherwise explain the needed command.",
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

function tierForAgent(agent: AgentDefinition | undefined): "low" | "mid" | "high" | undefined {
  switch (agent?.model) {
    case "low":
    case "mid":
    case "high":
      return agent.model;
    default:
      return undefined;
  }
}

function formatSelectedSkills(prompt: string, skills: readonly DreamSkill[]): string {
  const selected = selectedSkillsForPrompt(prompt, skills);
  if (selected.length === 0) {
    return "Available Dream Code skills: none active. Use @skill-name to activate one.";
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
  const requested = new Set([...prompt.matchAll(/@([a-zA-Z0-9._-]+)/gu)].map((match) => match[1]?.toLowerCase()).filter(isString));
  if (requested.size === 0) {
    return [];
  }
  return skills.filter((skill) => requested.has(skill.name)).slice(0, 5);
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}

function messageChars(messages: readonly ChatMessage[]): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

function optionalSignal<T extends object>(input: T, signal: AbortSignal | undefined): T | T & { readonly signal: AbortSignal } {
  return signal === undefined ? input : { ...input, signal };
}
