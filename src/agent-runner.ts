import { cwd } from "node:process";

import { ansi, paint } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import {
  MissingProviderConfigError,
  ProviderProtocolError,
  ProviderRequestError,
  streamChatCompletion,
  type ChatMessage,
} from "./llm-provider.js";
import { selectModelForPrompt } from "./model-routing.js";

export type AgentPromptOptions = {
  readonly config: DreamConfig;
  readonly configRoot?: string;
  readonly prompt: string;
  readonly write: (text: string) => void;
};

export async function runAgentPrompt(options: AgentPromptOptions): Promise<void> {
  const selectedModel = selectModelForPrompt(options.config.model, options.prompt);
  options.write(`${paint(`dream ${selectedModel.model} (${selectedModel.reason})`, ansi.guide)}\n`);

  try {
    const streamInput = options.configRoot === undefined
      ? {
        selectedModel,
        messages: createAgentMessages(options.prompt),
        onToken: options.write,
      }
      : {
        selectedModel,
        messages: createAgentMessages(options.prompt),
        configRoot: options.configRoot,
        onToken: options.write,
      };
    await streamChatCompletion(streamInput);
    options.write("\n");
  } catch (error) {
    if (error instanceof MissingProviderConfigError) {
      options.write(`${paint(error.message, ansi.yellow)}\n`);
      return;
    }
    if (error instanceof ProviderRequestError || error instanceof ProviderProtocolError) {
      options.write(`${paint(error.message, ansi.red)}\n`);
      return;
    }
    throw error;
  }
}

export function createAgentMessages(prompt: string): readonly ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are Dream Code, a fast coding harness CLI.",
        "Answer concisely, prefer actionable engineering steps, and mention files or commands when useful.",
        `Workspace: ${cwd()}`,
      ].join("\n"),
    },
    { role: "user", content: prompt },
  ];
}
