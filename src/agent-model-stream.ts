import { ansi, paint } from "./ansi.js";
import {
  MissingProviderConfigError,
  ProviderProtocolError,
  ProviderRequestError,
  streamChatCompletion,
  type ChatMessage,
} from "./llm-provider.js";
import { messageChars, optionalSignal } from "./agent-runner-utils.js";
import { defaultConfigRoot } from "./config.js";
import { recordModelTelemetry } from "./model-telemetry.js";
import type { SelectedModel } from "./model-routing.js";
import { createAgentResponseSession } from "./tui-agent-response.js";

type AgentModelStreamOptions = {
  readonly configRoot?: string;
  readonly signal?: AbortSignal;
  readonly write: (text: string) => void;
};

export async function streamAgentWithFailover(
  options: AgentModelStreamOptions,
  selectedModels: readonly SelectedModel[],
  messages: readonly ChatMessage[],
): Promise<string> {
  let lastError: unknown;
  for (let index = 0; index < selectedModels.length; index += 1) {
    const selectedModel = selectedModels[index];
    if (selectedModel === undefined) {
      continue;
    }
    try {
      return await streamAgentOnce(options, selectedModel, messages);
    } catch (error) {
      lastError = error;
      const nextModel = selectedModels[index + 1];
      if (nextModel === undefined || !isRetryableModelError(error)) {
        throw error;
      }
      options.write(formatModelFailover(selectedModel, nextModel, error));
    }
  }
  throw lastError instanceof Error ? lastError : new ProviderProtocolError("No model candidates available.");
}

async function streamAgentOnce(
  options: AgentModelStreamOptions,
  selectedModel: SelectedModel,
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
    response.stop();
    await recordModelTelemetry(configRoot, {
      ...modelTelemetryInput(selectedModel, false, startedAt, messages, assistantText),
      error: error instanceof Error ? error.message : "Unknown provider failure",
    });
    throw error;
  }
}

function modelTelemetryInput(
  selectedModel: SelectedModel,
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

function isRetryableModelError(error: unknown): boolean {
  return error instanceof MissingProviderConfigError
    || error instanceof ProviderRequestError
    || error instanceof ProviderProtocolError;
}

function formatModelFailover(
  failed: SelectedModel,
  next: SelectedModel,
  error: unknown,
): string {
  const message = error instanceof Error ? error.message : "unknown provider failure";
  return [
    `${paint("↻", ansi.yellow)} ${paint("model failover", ansi.yellow)}`,
    `${paint(`${failed.provider}/${failed.model}`, ansi.dim)} -> ${paint(`${next.provider}/${next.model}`, ansi.blue)}`,
    paint(message.split(/\r?\n/u)[0] ?? "", ansi.guide),
  ].join(" ").concat("\n");
}
