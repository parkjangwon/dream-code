import { stdout as output } from "node:process";

import { runAgentPrompt } from "./agent-runner.js";
import { stripAnsi } from "./ansi.js";
import { createLlmCompactSummarizer } from "./compact-summarizer.js";
import type { DreamConfig } from "./config.js";
import { continueGoalIfNeeded } from "./goal-continuation.js";
import { recordGoalEvidence } from "./goal-state.js";
import { cleanRemoteCommandOutput } from "./remote-command-output.js";
import { appendSessionTurn } from "./session-store.js";
import { maybeAutoCompactSession } from "./session-actions.js";
import { approveAgentTool } from "./tui-tool-approval.js";
import type { AgentToolRequest } from "./agent-tool-schema.js";
import type { CommandResult, Questioner } from "./tui-questioner.js";
import type { SessionRuntime } from "./tui-session-commands.js";
import { buildBottomStatusLines } from "./tui-status-bar.js";
import { createLayeredMainWriter, renderLayeredScreen } from "./tui-layered-screen.js";
import { createRunningInputSession, type RunningInputSession } from "./tui-running-input.js";
import type { ResizeSubscriber } from "./tui-fullscreen.js";
import { setActiveOutputScroller } from "./tui-output-scroll.js";

export type RunAgentTextPromptOptions = {
  readonly text: string;
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly questioner: Questioner;
  readonly cwd: string;
  readonly sessionRuntime?: SessionRuntime;
  readonly oneShotYolo?: boolean;
  readonly signal?: AbortSignal;
  readonly resize?: ResizeSubscriber;
};

export async function runAgentTextPrompt(options: RunAgentTextPromptOptions): Promise<CommandResult> {
  if (options.sessionRuntime !== undefined) {
    await appendSessionTurn(options.configRoot, options.sessionRuntime.currentId(), "user", options.text);
  }
  let assistantTranscript = "";
  const sessionId = options.sessionRuntime?.currentId();
  const runtime = await agentResponseRuntime(options);
  runtime.steering?.start();
  runtime.write(`> ${options.text}\n`);
  const signal = agentSignal(options, runtime.steering);
  const agentPrompt = {
    config: options.config,
    configRoot: options.configRoot,
    prompt: options.text,
    cwd: options.cwd,
    ...(signal === undefined ? {} : { signal }),
    approveTool: (request: AgentToolRequest) => approveAgentTool(request, options.questioner),
    ...(runtime.steering === undefined ? {} : { steering: runtime.steering }),
    write: (chunk: string) => {
      runtime.write(chunk);
      assistantTranscript = `${assistantTranscript}${stripAnsi(chunk)}`;
    },
  };
  let queuedInputs: readonly string[] = [];
  try {
    await runAgentPrompt(sessionId === undefined ? agentPrompt : { ...agentPrompt, sessionId });
  } finally {
    queuedInputs = runtime.steering?.stop() ?? [];
    runtime.afterSteeringStop?.();
  }
  await finishAgentTextPrompt(options, assistantTranscript, runtime.write);
  runtime.flushScrollback?.();
  return queuedInputs.length === 0
    ? { config: options.config, shouldContinue: true }
    : { config: options.config, shouldContinue: true, queuedInputs };
}

type AgentResponseRuntime = {
  readonly write: (chunk: string) => boolean;
  readonly steering?: RunningInputSession;
  readonly afterSteeringStop?: () => void;
  readonly flushScrollback?: () => void;
};

async function agentResponseRuntime(options: RunAgentTextPromptOptions): Promise<AgentResponseRuntime> {
  const sessionId = options.sessionRuntime?.currentId();
  if (output.isTTY !== true || sessionId === undefined) {
    return { write: (chunk) => output.write(chunk) };
  }

  const statusLines = await buildBottomStatusLines({
    config: options.config,
    configRoot: options.configRoot,
    sessionId,
    cwd: options.cwd,
    oneShotYolo: options.oneShotYolo === true,
  });
  const layout = await renderLayeredScreen({
    config: options.config,
    oneShotYolo: options.oneShotYolo === true,
    statusLines,
    busyLabel: "thinking",
    guideLine: "esc interrupt · input resumes after this turn",
    terminalRows: output.rows,
    terminalColumns: output.columns,
  });
  const steering = createRunningInputSession(statusLines, options.resize);
  let steeringActive = true;
  const writer = createLayeredMainWriter(layout, {
    topChrome: { config: options.config, oneShotYolo: options.oneShotYolo === true },
    afterWrite: () => (steeringActive ? steering.cursorSequence() : ""),
    afterRender: () => {
      if (steeringActive) {
        steering.refreshAfterOutput();
      }
    },
    terminalRows: () => output.rows,
    terminalColumns: () => output.columns,
  });
  setActiveOutputScroller(writer);
  return {
    write: writer.write,
    steering,
    flushScrollback: writer.flushScrollback,
    afterSteeringStop: () => {
      steeringActive = false;
    },
  };
}

function agentSignal(
  options: RunAgentTextPromptOptions,
  steering: RunningInputSession | undefined,
): AbortSignal | undefined {
  return options.signal ?? steering?.signal;
}

async function finishAgentTextPrompt(
  options: RunAgentTextPromptOptions,
  assistantTranscript: string,
  write: (chunk: string) => boolean,
): Promise<void> {
  if (options.sessionRuntime !== undefined) {
    await appendSessionTurn(options.configRoot, options.sessionRuntime.currentId(), "assistant", cleanRemoteCommandOutput(assistantTranscript));
    await maybeAutoCompactSession(options.configRoot, options.sessionRuntime.currentId(), {
      summarizer: createLlmCompactSummarizer(options.config, options.configRoot),
    }).catch((error: unknown) => {
      if (error instanceof Error) {
        write(`auto compact skipped: ${error.message}\n`);
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
    write,
    cwd: options.cwd,
    ...(options.sessionRuntime === undefined ? {} : { sessionRuntime: options.sessionRuntime }),
  });
}

function truncateEvidence(text: string): string {
  const normalized = text.trim().replace(/\s+/gu, " ");
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}
