import { cwd } from "node:process";

import { actorRoleForRun } from "./agent-actor.js";
import type { AgentSteering } from "./agent-steering.js";
import type { AgentDefinition } from "./agent-library.js";
import { writeAgentFailure } from "./agent-runner-stream.js";
import { createAgentMessages } from "./agent-messages.js";
import { prepareAgentContext } from "./agent-runner-context.js";
import { runAgentConversationLoop } from "./agent-runner-loop.js";
import { registerActor, updateActorStatus } from "./actor-store.js";
import {
  startAgentRun,
} from "./agent-run-store.js";
import type { AgentRunKind, AgentRunStatus } from "./agent-run-record.js";
import { defaultConfigRoot, type DreamConfig } from "./config.js";
import type { AgentToolRequest } from "./agent-tool-schema.js";
import {
  MissingProviderConfigError,
  ProviderProtocolError,
  ProviderRequestError,
} from "./llm-provider.js";
import { formatModelRoutingContext } from "./model-routing-context.js";
import { notifyAgentComplete } from "./notifications.js";

export type AgentPromptOptions = {
  readonly config: DreamConfig;
  readonly configRoot?: string;
  readonly prompt: string;
  readonly agent?: AgentDefinition;
  readonly cwd?: string;
  readonly sessionId?: string;
  readonly signal?: AbortSignal;
  readonly runKind?: AgentRunKind;
  readonly runLabel?: string;
  readonly renderResponse?: boolean;
  readonly approveTool?: (request: AgentToolRequest) => Promise<boolean>;
  readonly steering?: AgentSteering;
  readonly write: (text: string) => void;
};

export { createAgentMessages } from "./agent-messages.js";
export { formatModelRoutingContext } from "./model-routing-context.js";

export async function runAgentPrompt(options: AgentPromptOptions): Promise<string> {
  const configRoot = options.configRoot ?? defaultConfigRoot();
  const activeCwd = options.cwd ?? cwd();
  const startedAt = Date.now();
  const run = await startAgentRun(configRoot, {
    kind: options.runKind ?? "agent",
    agentId: options.agent?.id ?? "dream",
    agentName: options.runLabel ?? options.agent?.name ?? "Dream",
    prompt: options.prompt,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const actor = await registerActor(configRoot, {
    role: actorRoleForRun(options.runKind ?? "agent", options.agent),
    name: options.runLabel ?? options.agent?.name ?? "Dream",
    task: options.prompt,
    runId: run.id,
    ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
  });
  const runOptions: AgentPromptOptions = {
    ...options,
    signal: run.signal,
    write: (chunk) => {
      run.write(chunk);
      options.write(chunk);
    },
  };
  let finalStatus: Exclude<AgentRunStatus, "queued" | "running"> = "done";
  let finalError: string | undefined;
  let finalAssistantText = "";

  const prepared = await prepareAgentContext(options, configRoot, actor.id, activeCwd);

  try {
    const result = await runAgentConversationLoop({
      options,
      runOptions,
      configRoot,
      actorId: actor.id,
      run,
      selectedModels: prepared.selectedModels,
      messages: prepared.messages,
    });
    finalStatus = result.status;
    finalAssistantText = result.assistantText;
    return finalAssistantText;
  } catch (error) {
    if (run.signal.aborted) {
      finalStatus = "cancelled";
      return finalAssistantText;
    }
    if (error instanceof MissingProviderConfigError) {
      finalStatus = "failed";
      finalError = error.message;
      if (options.renderResponse === false) {
        throw error;
      }
      writeAgentFailure(runOptions, prepared.primaryModel, error.message, "warn");
      return finalAssistantText;
    }
    if (error instanceof ProviderRequestError || error instanceof ProviderProtocolError) {
      finalStatus = "failed";
      finalError = error.message;
      if (options.renderResponse === false) {
        throw error;
      }
      writeAgentFailure(runOptions, prepared.primaryModel, error.message, "error");
      return finalAssistantText;
    }
    finalStatus = run.signal.aborted ? "cancelled" : "failed";
    finalError = error instanceof Error ? error.message : "Unknown agent failure";
    throw error;
  } finally {
    const status = run.signal.aborted && finalStatus === "done" ? "cancelled" : finalStatus;
    await run.finish(status, finalError === undefined ? undefined : { error: finalError });
    await updateActorStatus(configRoot, actor.id, status, finalError === undefined ? {} : { error: finalError });
    if (status === "done" && options.renderResponse !== false) {
      await notifyAgentComplete(options.config, options.prompt, Date.now() - startedAt);
    }
  }
}
