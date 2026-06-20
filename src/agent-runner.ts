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
import { createAgentResponseSession } from "./tui-agent-response.js";

export type AgentPromptOptions = {
  readonly config: DreamConfig;
  readonly configRoot?: string;
  readonly prompt: string;
  readonly write: (text: string) => void;
};

export async function runAgentPrompt(options: AgentPromptOptions): Promise<void> {
  const selectedModel = selectModelForPrompt(options.config.model, options.prompt);
  const response = createAgentResponseSession({
    selectedModel,
    write: options.write,
  });
  response.start();

  try {
    const streamInput = options.configRoot === undefined
      ? {
        selectedModel,
        messages: createAgentMessages(options.prompt),
        onToken: response.token,
      }
      : {
        selectedModel,
        messages: createAgentMessages(options.prompt),
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
