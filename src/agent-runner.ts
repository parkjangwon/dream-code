import { cwd } from "node:process";

import type { DreamConfig } from "./config.js";
import {
  MissingProviderConfigError,
  ProviderProtocolError,
  ProviderRequestError,
  streamChatCompletion,
  type ChatMessage,
} from "./llm-provider.js";
import { selectModelForPrompt } from "./model-routing.js";
import { loadSkillSettings, skillEnabled } from "./skill-settings.js";
import { loadSkills, type DreamSkill } from "./skills.js";
import { createAgentResponseSession } from "./tui-agent-response.js";

export type AgentPromptOptions = {
  readonly config: DreamConfig;
  readonly configRoot?: string;
  readonly prompt: string;
  readonly write: (text: string) => void;
};

export async function runAgentPrompt(options: AgentPromptOptions): Promise<void> {
  const selectedModel = selectModelForPrompt(options.config.model, options.prompt);
  const settings = await loadSkillSettings(options.configRoot);
  const skills = (await loadSkills()).filter((skill) => skillEnabled(settings, skill.name));
  const response = createAgentResponseSession({
    selectedModel,
    write: options.write,
  });
  response.start();

  try {
    const streamInput = options.configRoot === undefined
      ? {
        selectedModel,
        messages: createAgentMessages(options.prompt, skills),
        onToken: response.token,
      }
      : {
        selectedModel,
        messages: createAgentMessages(options.prompt, skills),
        configRoot: options.configRoot,
        onToken: response.token,
      };
    await streamChatCompletion(streamInput);
    response.finish();
  } catch (error) {
    if (error instanceof MissingProviderConfigError) {
      response.fail(error.message, "warn");
      return;
    }
    if (error instanceof ProviderRequestError || error instanceof ProviderProtocolError) {
      response.fail(error.message, "error");
      return;
    }
    throw error;
  }
}

export function createAgentMessages(prompt: string, skills: readonly DreamSkill[] = []): readonly ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are Dream Code, a fast coding harness CLI.",
        "Answer concisely, prefer actionable engineering steps, and mention files or commands when useful.",
        `Workspace: ${cwd()}`,
        formatSelectedSkills(prompt, skills),
      ].join("\n"),
    },
    { role: "user", content: prompt },
  ];
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
