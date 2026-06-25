import { ansi, paint } from "./ansi.js";
import { streamAgentWithFailover, type AgentModelStreamOptions } from "./agent-model-stream.js";
import type { AgentSteering } from "./agent-steering.js";
import type { AgentPromptOptions } from "./agent-runner.js";
import type { ChatMessage } from "./llm-provider.js";
import type { SelectedModel } from "./model-routing.js";
import { writeStickyModel } from "./model-routing-state.js";
import { createAgentResponseSession } from "./tui-agent-response.js";

export type AgentStreamTurnResult =
  | { readonly kind: "completed"; readonly text: string }
  | { readonly kind: "steered" };

export async function streamAgentTurn(
  runOptions: AgentPromptOptions,
  configRoot: string,
  selectedModels: readonly SelectedModel[],
  messages: readonly ChatMessage[],
): Promise<AgentStreamTurnResult> {
  const signal = modelStreamSignal(runOptions.signal, runOptions.steering);
  try {
    const text = await streamAgentWithFailover(
      { ...streamOptions(runOptions, configRoot), ...(signal === undefined ? {} : { signal }) },
      selectedModels,
      messages,
    );
    return { kind: "completed", text };
  } catch (error) {
    if (isSteeringInterrupt(error, runOptions.steering)) {
      runOptions.write(formatSteeringRestart());
      return { kind: "steered" };
    }
    throw error;
  } finally {
    runOptions.steering?.finishStream?.();
  }
}

export function writeAgentFailure(
  options: AgentPromptOptions,
  selectedModel: SelectedModel,
  message: string,
  tone: "warn" | "error",
): void {
  createAgentResponseSession({ selectedModel, write: options.write }).fail(message, tone);
}

function streamOptions(options: AgentPromptOptions, configRoot: string): AgentModelStreamOptions {
  return {
    configRoot,
    write: options.write,
    onSelectedModel: (selectedModel) => writeStickyModel(configRoot, options.sessionId, selectedModel),
    ...(options.renderResponse === undefined ? {} : { renderResponse: options.renderResponse }),
  };
}

function modelStreamSignal(runSignal: AbortSignal | undefined, steering: AgentSteering | undefined): AbortSignal | undefined {
  const steeringSignal = steering?.streamSignal?.();
  if (runSignal === undefined) {
    return steeringSignal;
  }
  if (steeringSignal === undefined) {
    return runSignal;
  }
  return AbortSignal.any([runSignal, steeringSignal]);
}

function isSteeringInterrupt(error: unknown, steering: AgentSteering | undefined): boolean {
  return isAbortLike(error) && steering?.consumeInterrupt?.() === true;
}

function isAbortLike(error: unknown): boolean {
  return error instanceof Error && ["AbortError", "RequestAbortedError"].includes(error.name);
}

function formatSteeringRestart(): string {
  return `${paint("*", ansi.accent)} ${paint("steering applied", ansi.accent)} ${paint("restarting model turn", ansi.guide)}\n`;
}
