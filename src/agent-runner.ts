import { cwd } from "node:process";

import { actorRoleForRun } from "./agent-actor.js";
import { appendSteeringMessages, type AgentSteering } from "./agent-steering.js";
import { appendActorInboxMessages } from "./agent-inbox-context.js";
import type { AgentDefinition } from "./agent-library.js";
import { connectedProviderIds, firstSelectedModel, tierForAgent } from "./agent-runner-routing.js";
import { streamAgentTurn, writeAgentFailure } from "./agent-runner-stream.js";
import { createAgentMessages } from "./agent-messages.js";
import { isAgentToolName } from "./agent-runner-utils.js";
import { runAgentToolGroups } from "./agent-runner-tool-execution.js";
import { registerActor, updateActorStatus } from "./actor-store.js";
import {
  startAgentRun,
} from "./agent-run-store.js";
import type { AgentRunKind, AgentRunStatus } from "./agent-run-record.js";
import { defaultConfigRoot, type DreamConfig } from "./config.js";
import { loadContextDocs } from "./context-docs.js";
import { loadCredentials } from "./credentials.js";
import { runHookEvent } from "./hooks.js";
import { formatLiveMcpContext } from "./mcp-context.js";
import { formatMentionedReferencesForPrompt, loadMentionedReferences } from "./file-mention-context.js";
import {
  extractAgentToolRequests,
  formatToolResults,
  type AgentToolResult,
  type AgentToolPolicy,
} from "./agent-tools.js";
import type { AgentToolRequest } from "./agent-tool-schema.js";
import { maxToolCyclesForRun } from "./agent-tool-budget.js";
import {
  type ChatMessage,
  MissingProviderConfigError,
  ProviderProtocolError,
  ProviderRequestError,
} from "./llm-provider.js";
import { loadUnhealthyModelKeys } from "./model-telemetry.js";
import { modelAvailableForCredential } from "./model-availability.js";
import { selectModelCandidatesForPrompt } from "./model-routing.js";
import { formatModelRoutingContext } from "./model-routing-context.js";
import { readStickyModel } from "./model-routing-state.js";
import { formatMemoryContext } from "./memory-store.js";
import { notifyAgentComplete } from "./notifications.js";
import { loadSkillSettings, skillEnabled } from "./skill-settings.js";
import { defaultSkillRoots, loadSkills } from "./skills.js";
import { formatCompactContext } from "./session-actions.js";
import { recentSessionMessages } from "./session-context.js";
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
  const maxToolCycles = maxToolCyclesForRun(options);

  const credentials = await loadCredentials(configRoot);
  const stickyModel = await readStickyModel(configRoot, options.sessionId);
  const selectedModels = selectModelCandidatesForPrompt(options.config.model, options.prompt, tierForAgent(options.agent), {
    connectedProviders: connectedProviderIds(options.config, credentials, process.env),
    unhealthyModels: await loadUnhealthyModelKeys(configRoot),
    modelAvailable: (provider, model) => modelAvailableForCredential(provider, model, credentials.providers[provider]),
    ...(options.agent === undefined ? {} : { agentId: options.agent.id }),
    ...(stickyModel === undefined ? {} : { stickyModel }),
  });
  const primaryModel = firstSelectedModel(selectedModels);
  const settings = await loadSkillSettings(configRoot);
  const skills = (await loadSkills(defaultSkillRoots(undefined, activeCwd))).filter((skill) => skillEnabled(settings, skill.name));
  const contextDocs = await loadContextDocs({ configRoot, cwd: activeCwd, prompt: options.prompt });
  const workspaceDirs = await loadWorkspaceDirs(configRoot);
  const mentionedContext = formatMentionedReferencesForPrompt(await loadMentionedReferences(options.prompt, { cwd: activeCwd, workspaceDirs }));
  const mcpContext = await formatLiveMcpContext(configRoot, options.signal);
  const compactContext = await formatCompactContext(configRoot, options.sessionId);
  const memoryContext = await formatMemoryContext(configRoot, activeCwd, options.sessionId, options.prompt);
  const recentMessages = await recentSessionMessages(configRoot, options.sessionId, options.prompt);
  let messages = appendSteeringMessages(
    await appendActorInboxMessages(
      configRoot,
      actor.id,
      createAgentMessages(
        options.prompt,
        skills,
        options.agent,
        contextDocs,
        workspaceDirs,
        mcpContext,
        compactContext,
        memoryContext,
        activeCwd,
        recentMessages,
        mentionedContext,
        formatModelRoutingContext(selectedModels),
      ),
    ),
    options.steering,
  );

  try {
    for (let cycle = 0; cycle < maxToolCycles; cycle += 1) {
      if (run.signal.aborted) {
        finalStatus = "cancelled";
        return finalAssistantText;
      }
      messages = appendSteeringMessages(
        await appendActorInboxMessages(configRoot, actor.id, messages),
        options.steering,
      );
      const streamResult = await streamAgentTurn(runOptions, configRoot, selectedModels, messages);
      if (streamResult.kind === "steered") {
        messages = appendSteeringMessages(
          await appendActorInboxMessages(configRoot, actor.id, messages),
          options.steering,
        );
        continue;
      }
      const assistantText = streamResult.text;
      finalAssistantText = assistantText;
      const requests = extractAgentToolRequests(assistantText);
      const assistantMessage: ChatMessage = { role: "assistant", content: assistantText };
      const messagesWithAssistant = [...messages, assistantMessage];
      const nextMessages = appendSteeringMessages(messagesWithAssistant, options.steering);
      if (nextMessages !== messagesWithAssistant) {
        messages = nextMessages;
        continue;
      }
      if (requests.length === 0) {
        return finalAssistantText;
      }
      const toolPolicy = agentToolPolicy(options, run.signal);
      const results = await runAgentToolGroups({ configRoot, run, requests, policy: toolPolicy, write: runOptions.write });
      if (run.signal.aborted) {
        finalStatus = "cancelled";
        return finalAssistantText;
      }
      messages = [
        ...messages,
        { role: "assistant", content: assistantText },
        { role: "user", content: formatToolResults(results) },
      ];
    }
    if (run.signal.aborted) {
      finalStatus = "cancelled";
      return finalAssistantText;
    }
    runOptions.write(`tool loop budget reached after ${maxToolCycles} cycles; asking for a compact checkpoint\n`);
    messages = [
      ...messages,
      {
        role: "user",
        content: "Tool loop budget reached. Stop requesting tools and summarize current progress, completed changes, unresolved risks, and the next safest action.",
      },
    ];
    while (true) {
      const streamResult = await streamAgentTurn(runOptions, configRoot, selectedModels, messages);
      if (streamResult.kind === "completed") {
        finalAssistantText = streamResult.text;
        return finalAssistantText;
      }
      messages = appendSteeringMessages(
        await appendActorInboxMessages(configRoot, actor.id, messages),
        options.steering,
      );
    }
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
      writeAgentFailure(runOptions, primaryModel, error.message, "warn");
      return finalAssistantText;
    }
    if (error instanceof ProviderRequestError || error instanceof ProviderProtocolError) {
      finalStatus = "failed";
      finalError = error.message;
      if (options.renderResponse === false) {
        throw error;
      }
      writeAgentFailure(runOptions, primaryModel, error.message, "error");
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

function agentToolPolicy(options: AgentPromptOptions, signal: AbortSignal): AgentToolPolicy {
  const allowedTools = options.agent === undefined
    ? undefined
    : options.agent.tools.filter(isAgentToolName);
  return {
    mode: options.config.permissions.mode,
    signal,
    configRoot: options.configRoot ?? defaultConfigRoot(),
    workspaceRoot: options.cwd ?? cwd(),
    shellAllowedExecutables: options.config.tools.shell.allowedExecutables,
    ...(options.approveTool === undefined ? {} : { approveTool: options.approveTool }),
    ...(allowedTools === undefined || allowedTools.length === 0 ? {} : { allowedTools }),
  };
}
