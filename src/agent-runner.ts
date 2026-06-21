import { cwd } from "node:process";

import { actorRoleForRun } from "./agent-actor.js";
import { appendActorInboxMessages } from "./agent-inbox-context.js";
import type { AgentDefinition } from "./agent-library.js";
import { createAgentMessages } from "./agent-messages.js";
import { isAgentToolName, messageChars, optionalSignal } from "./agent-runner-utils.js";
import { registerActor, updateActorStatus } from "./actor-store.js";
import {
  startAgentRun,
} from "./agent-run-store.js";
import type { AgentRunKind, AgentRunStatus } from "./agent-run-record.js";
import { defaultConfigRoot, type DreamConfig } from "./config.js";
import { loadContextDocs } from "./context-docs.js";
import { loadCredentials } from "./credentials.js";
import { runHookEvent } from "./hooks.js";
import type { ProviderEnv } from "./llm-provider.js";
import { formatLiveMcpContext } from "./mcp-context.js";
import {
  extractAgentToolRequests,
  formatToolProgress,
  formatToolResults,
  runAgentToolRequest,
  type AgentToolResult,
  type AgentToolPolicy,
} from "./agent-tools.js";
import {
  MissingProviderConfigError,
  ProviderProtocolError,
  ProviderRequestError,
  streamChatCompletion,
  type ChatMessage,
} from "./llm-provider.js";
import { loadUnhealthyModelKeys, recordModelTelemetry } from "./model-telemetry.js";
import { selectModelForPrompt } from "./model-routing.js";
import { formatMemoryContext } from "./memory-store.js";
import { listProviderDefinitions } from "./provider-registry.js";
import { loadSkillSettings, skillEnabled } from "./skill-settings.js";
import { loadSkills } from "./skills.js";
import { formatCompactContext } from "./session-actions.js";
import { createAgentResponseSession } from "./tui-agent-response.js";
import { providerConnectionSource } from "./tui-provider-status.js";
import { loadWorkspaceDirs } from "./workspace-state.js";

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
  readonly write: (text: string) => void;
};

export { createAgentMessages } from "./agent-messages.js";

const maxToolCycles = 3;

export async function runAgentPrompt(options: AgentPromptOptions): Promise<void> {
  const configRoot = options.configRoot ?? defaultConfigRoot();
  const activeCwd = options.cwd ?? cwd();
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

  const selectedModel = selectModelForPrompt(options.config.model, options.prompt, tierForAgent(options.agent), {
    connectedProviders: await connectedProviderIds(configRoot, process.env),
    unhealthyModels: await loadUnhealthyModelKeys(configRoot),
  });
  const settings = await loadSkillSettings(configRoot);
  const skills = (await loadSkills()).filter((skill) => skillEnabled(settings, skill.name));
  const contextDocs = await loadContextDocs({ configRoot, cwd: activeCwd, prompt: options.prompt });
  const workspaceDirs = await loadWorkspaceDirs(configRoot);
  const mcpContext = await formatLiveMcpContext(configRoot, options.signal);
  const compactContext = await formatCompactContext(configRoot, options.sessionId);
  const memoryContext = await formatMemoryContext(configRoot, activeCwd, options.sessionId, options.prompt);
  let messages = await appendActorInboxMessages(
    configRoot,
    actor.id,
    createAgentMessages(options.prompt, skills, options.agent, contextDocs, workspaceDirs, mcpContext, compactContext, memoryContext, activeCwd),
  );

  try {
    for (let cycle = 0; cycle < maxToolCycles; cycle += 1) {
      if (run.signal.aborted) {
        finalStatus = "cancelled";
        return;
      }
      messages = await appendActorInboxMessages(configRoot, actor.id, messages);
      const assistantText = await streamAgentOnce(runOptions, selectedModel, messages);
      const requests = extractAgentToolRequests(assistantText);
      if (requests.length === 0) {
        return;
      }
      const results: AgentToolResult[] = [];
      for (const request of requests) {
        if (run.signal.aborted) {
          finalStatus = "cancelled";
          return;
        }
        await runHookEvent(configRoot, "preTool", { tool: request.tool });
        const result = await runAgentToolRequest(request, agentToolPolicy(options, run.signal));
        run.tool(request.tool, result.changedPath);
        await runHookEvent(configRoot, "postTool", { tool: request.tool, ok: String(result.ok) });
        runOptions.write(formatToolProgress(result));
        results.push(result);
      }
      messages = [
        ...messages,
        { role: "assistant", content: assistantText },
        { role: "user", content: formatToolResults(results) },
      ];
    }
  } catch (error) {
    if (run.signal.aborted) {
      finalStatus = "cancelled";
      return;
    }
    if (error instanceof MissingProviderConfigError) {
      finalStatus = "failed";
      finalError = error.message;
      writeAgentFailure(runOptions, selectedModel, error.message, "warn");
      return;
    }
    if (error instanceof ProviderRequestError || error instanceof ProviderProtocolError) {
      finalStatus = "failed";
      finalError = error.message;
      writeAgentFailure(runOptions, selectedModel, error.message, "error");
      return;
    }
    finalStatus = run.signal.aborted ? "cancelled" : "failed";
    finalError = error instanceof Error ? error.message : "Unknown agent failure";
    throw error;
  } finally {
    const status = run.signal.aborted && finalStatus === "done" ? "cancelled" : finalStatus;
    await run.finish(status, finalError === undefined ? undefined : { error: finalError });
    await updateActorStatus(configRoot, actor.id, status, finalError === undefined ? {} : { error: finalError });
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
    response.stop();
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

function agentToolPolicy(options: AgentPromptOptions, signal: AbortSignal): AgentToolPolicy {
  const allowedTools = options.agent === undefined
    ? undefined
    : options.agent.tools.filter(isAgentToolName);
  return {
    mode: options.config.permissions.mode,
    signal,
    configRoot: options.configRoot ?? defaultConfigRoot(),
    ...(allowedTools === undefined || allowedTools.length === 0 ? {} : { allowedTools }),
  };
}
