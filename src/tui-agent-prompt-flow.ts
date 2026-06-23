import { stdout as output } from "node:process";

import { runAgentPrompt } from "./agent-runner.js";
import { stripAnsi } from "./ansi.js";
import { createLlmCompactSummarizer } from "./compact-summarizer.js";
import type { DreamConfig } from "./config.js";
import { continueGoalIfNeeded } from "./goal-continuation.js";
import { recordGoalEvidence } from "./goal-state.js";
import { appendSessionTurn } from "./session-store.js";
import { maybeAutoCompactSession } from "./session-actions.js";
import { approveAgentTool } from "./tui-tool-approval.js";
import type { AgentToolRequest } from "./agent-tool-schema.js";
import type { CommandResult, Questioner } from "./tui-questioner.js";
import type { SessionRuntime } from "./tui-session-commands.js";

export type RunAgentTextPromptOptions = {
  readonly text: string;
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly questioner: Questioner;
  readonly cwd: string;
  readonly sessionRuntime?: SessionRuntime;
  readonly signal?: AbortSignal;
};

export async function runAgentTextPrompt(options: RunAgentTextPromptOptions): Promise<CommandResult> {
  if (options.sessionRuntime !== undefined) {
    await appendSessionTurn(options.configRoot, options.sessionRuntime.currentId(), "user", options.text);
  }
  let assistantTranscript = "";
  const sessionId = options.sessionRuntime?.currentId();
  const agentPrompt = {
    config: options.config,
    configRoot: options.configRoot,
    prompt: options.text,
    cwd: options.cwd,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    approveTool: (request: AgentToolRequest) => approveAgentTool(request, options.questioner),
    write: (chunk: string) => {
      output.write(chunk);
      assistantTranscript = `${assistantTranscript}${stripAnsi(chunk)}`;
    },
  };
  await runAgentPrompt(sessionId === undefined ? agentPrompt : { ...agentPrompt, sessionId });
  await finishAgentTextPrompt(options, assistantTranscript);
  return { config: options.config, shouldContinue: true };
}

async function finishAgentTextPrompt(options: RunAgentTextPromptOptions, assistantTranscript: string): Promise<void> {
  if (options.sessionRuntime !== undefined) {
    await appendSessionTurn(options.configRoot, options.sessionRuntime.currentId(), "assistant", assistantTranscript);
    await maybeAutoCompactSession(options.configRoot, options.sessionRuntime.currentId(), {
      summarizer: createLlmCompactSummarizer(options.config, options.configRoot),
    }).catch((error: unknown) => {
      if (error instanceof Error) {
        output.write(`auto compact skipped: ${error.message}\n`);
        return;
      }
      throw error;
    });
  }
  await recordGoalEvidence(options.configRoot, `Answered: ${truncateEvidence(options.text)}`);
  await continueGoalIfNeeded({
    config: options.config,
    configRoot: options.configRoot,
    userText: options.text,
    assistantTranscript,
    write: (chunk) => output.write(chunk),
    cwd: options.cwd,
    ...(options.sessionRuntime === undefined ? {} : { sessionRuntime: options.sessionRuntime }),
  });
}

function truncateEvidence(text: string): string {
  const normalized = text.trim().replace(/\s+/gu, " ");
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}
