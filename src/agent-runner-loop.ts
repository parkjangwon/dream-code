import { cwd } from "node:process";

import { appendActorInboxMessages } from "./agent-inbox-context.js";
import type { AgentRunHandle, AgentRunStatus } from "./agent-run-record.js";
import type { AgentPromptOptions } from "./agent-runner.js";
import { streamAgentTurn } from "./agent-runner-stream.js";
import { isAgentToolName } from "./agent-runner-utils.js";
import { runAgentToolGroups } from "./agent-runner-tool-execution.js";
import { appendSteeringMessages } from "./agent-steering.js";
import { maxToolCyclesForRun } from "./agent-tool-budget.js";
import {
  extractAgentToolRequests,
  formatToolResults,
  type AgentToolPolicy,
} from "./agent-tools.js";
import type { ChatMessage } from "./llm-provider.js";
import type { SelectedModel } from "./model-routing.js";
import { defaultConfigRoot } from "./config.js";

export type AgentConversationLoopResult = {
  readonly status: Exclude<AgentRunStatus, "queued" | "running">;
  readonly assistantText: string;
};

export type AgentConversationLoopInput = {
  readonly options: AgentPromptOptions;
  readonly runOptions: AgentPromptOptions;
  readonly configRoot: string;
  readonly actorId: string;
  readonly run: AgentRunHandle;
  readonly selectedModels: readonly SelectedModel[];
  readonly messages: readonly ChatMessage[];
};

export async function runAgentConversationLoop(input: AgentConversationLoopInput): Promise<AgentConversationLoopResult> {
  let messages = input.messages;
  let finalAssistantText = "";
  const maxToolCycles = maxToolCyclesForRun(input.options);

  for (let cycle = 0; cycle < maxToolCycles; cycle += 1) {
    if (input.run.signal.aborted) {
      return { status: "cancelled", assistantText: finalAssistantText };
    }
    messages = appendSteeringMessages(
      await appendActorInboxMessages(input.configRoot, input.actorId, messages),
      input.options.steering,
    );
    const streamResult = await streamAgentTurn(input.runOptions, input.configRoot, input.selectedModels, messages);
    if (streamResult.kind === "steered") {
      messages = appendSteeringMessages(
        await appendActorInboxMessages(input.configRoot, input.actorId, messages),
        input.options.steering,
      );
      continue;
    }
    const assistantText = streamResult.text;
    finalAssistantText = assistantText;
    const requests = extractAgentToolRequests(assistantText);
    const assistantMessage: ChatMessage = { role: "assistant", content: assistantText };
    const messagesWithAssistant = [...messages, assistantMessage];
    const nextMessages = appendSteeringMessages(messagesWithAssistant, input.options.steering);
    if (nextMessages !== messagesWithAssistant) {
      messages = nextMessages;
      continue;
    }
    if (requests.length === 0) {
      return { status: "done", assistantText: finalAssistantText };
    }
    const results = await runAgentToolGroups({
      configRoot: input.configRoot,
      run: input.run,
      requests,
      policy: agentToolPolicy(input.options, input.run.signal),
      write: input.runOptions.write,
    });
    if (input.run.signal.aborted) {
      return { status: "cancelled", assistantText: finalAssistantText };
    }
    messages = [
      ...messages,
      { role: "assistant", content: assistantText },
      { role: "user", content: formatToolResults(results) },
    ];
  }

  if (input.run.signal.aborted) {
    return { status: "cancelled", assistantText: finalAssistantText };
  }
  input.runOptions.write(`tool loop budget reached after ${maxToolCycles} cycles; asking for a compact checkpoint\n`);
  messages = [
    ...messages,
    {
      role: "user",
      content: "Tool loop budget reached. Stop requesting tools and summarize current progress, completed changes, unresolved risks, and the next safest action.",
    },
  ];
  while (true) {
    const streamResult = await streamAgentTurn(input.runOptions, input.configRoot, input.selectedModels, messages);
    if (streamResult.kind === "completed") {
      return { status: "done", assistantText: streamResult.text };
    }
    messages = appendSteeringMessages(
      await appendActorInboxMessages(input.configRoot, input.actorId, messages),
      input.options.steering,
    );
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
