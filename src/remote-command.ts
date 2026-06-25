import { stdout as output } from "node:process";

import { runAgentPrompt } from "./agent-runner.js";
import { loadConfig } from "./config.js";
import { appendSessionTurn, readSession, startSession, type DreamSession } from "./session-store.js";
import { stripAnsi } from "./ansi.js";
import { activityFromAgentProgress } from "./remote-command-activity.js";
import { isRemoteSlashCommandAllowed } from "./remote-slash-commands.js";
import { runWorkspaceCommand } from "./tui-workspace-commands.js";
import type { Questioner } from "./tui-questioner.js";
import { approveAgentTool } from "./tui-tool-approval.js";

type WriteCallback = (error?: Error | null) => void;

export type RemoteCommandInput = {
  readonly configRoot: string;
  readonly prompt: string;
  readonly cwd: string;
  readonly sessionId?: string;
  readonly signal?: AbortSignal;
  readonly onActivity?: (activity: RemoteCommandActivityInput) => void;
  readonly onChunk?: (chunk: string) => void;
  readonly onSession?: (sessionId: string) => void;
};

export type RemoteCommandActivityInput = {
  readonly label: string;
  readonly detail?: string;
};

export type RemoteCommandResult = {
  readonly sessionId: string;
  readonly output: string;
  readonly shouldContinue: boolean;
};

export class RemoteCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteCommandError";
  }
}

export async function runRemoteCommand(input: RemoteCommandInput): Promise<RemoteCommandResult> {
  if (isSignalAborted(input.signal)) {
    throw new RemoteCommandError("Remote command was cancelled before it started.");
  }
  input.onActivity?.({ label: "Loading session", detail: "Opening the selected Dream Code workspace" });
  const session = await remoteSession(input);
  input.onSession?.(session.id);
  input.onActivity?.({ label: "Loading config", detail: "Reading providers, permissions, and routing settings" });
  const config = await loadConfig(input.configRoot);
  if (!input.prompt.startsWith("/")) {
    input.onActivity?.({ label: "Recording prompt", detail: "Adding your message to the session transcript" });
    await appendSessionTurn(input.configRoot, session.id, "user", input.prompt);
    input.onActivity?.({ label: "Running agent", detail: "Dream Code is reasoning and may use tools" });
    const assistantText = await runAgentPrompt({
      config,
      configRoot: input.configRoot,
      prompt: input.prompt,
      cwd: input.cwd,
      sessionId: session.id,
      renderResponse: false,
      write: (text) => {
        const activity = activityFromAgentProgress(text);
        if (activity !== undefined) {
          input.onActivity?.(activity);
        }
      },
      approveTool: (request) => approveAgentTool(request, remoteQuestioner()),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    if (isSignalAborted(input.signal)) {
      throw new RemoteCommandError("Remote command was cancelled.");
    }
    input.onActivity?.({ label: "Finalizing answer", detail: "Saving the assistant response" });
    await appendSessionTurn(input.configRoot, session.id, "assistant", assistantText);
    input.onChunk?.(assistantText);
    return { sessionId: session.id, output: assistantText, shouldContinue: true };
  }
  if (!isRemoteSlashCommandAllowed(commandName(input.prompt))) {
    throw new RemoteCommandError(`${commandName(input.prompt)} is not available in Dream Remote.`);
  }
  input.onActivity?.({ label: "Running slash command", detail: "Executing the command through Dream Code" });
  const chunks: string[] = [];
  const originalWrite = output.write;
  output.write = ((chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | WriteCallback, callback?: WriteCallback): boolean => {
    const text = stripAnsi(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    chunks.push(text);
    input.onChunk?.(text);
    const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    done?.();
    return true;
  }) as typeof output.write;
  try {
    const result = await runWorkspaceCommand(input.prompt, config, false, remoteQuestioner(), input.configRoot, {
      currentId: () => session.id,
      switchTo: () => undefined,
    }, input.cwd, input.signal);
    return { sessionId: session.id, output: chunks.join(""), shouldContinue: result.shouldContinue };
  } finally {
    output.write = originalWrite;
  }
}

function isSignalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function commandName(prompt: string): string {
  return prompt.trimStart().split(/\s+/u)[0] ?? "";
}

async function remoteSession(input: RemoteCommandInput): Promise<DreamSession> {
  if (input.sessionId !== undefined) {
    const session = await readSession(input.configRoot, input.sessionId);
    if (session !== undefined) {
      return session;
    }
    throw new RemoteCommandError("Remote session was not found.");
  }
  return startSession(input.configRoot, input.cwd);
}

function remoteQuestioner(): Questioner {
  return {
    question: async (prompt: string) => {
      throw new RemoteCommandError(`Remote command requires interactive input: ${prompt}`);
    },
    wasCancelled: () => false,
  };
}
