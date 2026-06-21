import { cwd as currentWorkingDirectory, stdout as output } from "node:process";

import { runAgentPrompt } from "./agent-runner.js";
import { stripAnsi } from "./ansi.js";
import { splitCommand } from "./command-parser.js";
import { createLlmCompactSummarizer } from "./compact-summarizer.js";
import {
  defaultConfigRoot,
  resolveEffectivePermissionMode,
  togglePersistedYolo,
  type DreamConfig,
} from "./config.js";
import { runDoctor, summarizeDoctor } from "./doctor.js";
import { continueGoalIfNeeded } from "./goal-continuation.js";
import { recordGoalEvidence } from "./goal-state.js";
import { runHookEvent } from "./hooks.js";
import { appendSessionTurn } from "./session-store.js";
import { maybeAutoCompactSession } from "./session-actions.js";
import { showAgentsMenu } from "./tui-agent-commands.js";
import { maybeEditFile, maybeRunShell, maybeWriteFile, printFile } from "./tui-file-commands.js";
import { configureModels } from "./tui-model-commands.js";
import type { PickerOptions } from "./tui-picker.js";
import { loginProvider, printProviders } from "./tui-provider-commands.js";
import { switchProvider } from "./tui-provider-switch.js";
import { renameCurrentSession, showSessionMenu, type SessionRuntime } from "./tui-session-commands.js";
import type { SkillManagerOptions } from "./tui-skill-manager.js";
import { showSkillMenu } from "./tui-skill-commands.js";
import { formatPermissionMode, printHelp } from "./tui-render.js";
import { runSwarmCommand } from "./tui-swarm-commands.js";
import { runUtilityCommand } from "./tui-utility-commands.js";
import { formatStatusDashboard } from "./status-dashboard.js";

export type CommandResult = {
  readonly config: DreamConfig;
  readonly shouldContinue: boolean;
};

export type Questioner = {
  readonly question: (prompt: string) => Promise<string>;
  readonly secret?: (prompt: string) => Promise<string>;
  readonly select?: (options: PickerOptions) => Promise<string | undefined>;
  readonly manageSkills?: (options: SkillManagerOptions) => Promise<readonly string[] | undefined>;
  readonly wasCancelled?: () => boolean;
};

export async function runWorkspaceCommand(
  text: string,
  config: DreamConfig,
  oneShotYolo: boolean,
  questioner: Questioner,
  configRoot = defaultConfigRoot(),
  sessionRuntime?: SessionRuntime,
  cwd = currentWorkingDirectory(),
  signal?: AbortSignal,
): Promise<CommandResult> {
  const result = await runWorkspaceCommandBody(text, config, oneShotYolo, questioner, configRoot, sessionRuntime, cwd, signal);
  await runHookEvent(configRoot, "postCommand", { command: text, ok: String(result.shouldContinue) });
  return result;
}

async function runWorkspaceCommandBody(
  text: string,
  config: DreamConfig,
  oneShotYolo: boolean,
  questioner: Questioner,
  configRoot: string,
  sessionRuntime: SessionRuntime | undefined,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<CommandResult> {
  const mode = resolveEffectivePermissionMode(config, oneShotYolo);

  if (text.startsWith("!")) {
    await maybeRunShell(text.slice(1).trim(), mode, questioner);
    return { config, shouldContinue: true };
  }

  if (!text.startsWith("/")) {
    if (sessionRuntime !== undefined) {
      await appendSessionTurn(configRoot, sessionRuntime.currentId(), "user", text);
    }
    let assistantTranscript = "";
    const sessionId = sessionRuntime?.currentId();
    const agentPrompt = {
      config,
      configRoot,
      prompt: text,
      cwd,
      ...(signal === undefined ? {} : { signal }),
      write: (chunk: string) => {
        output.write(chunk);
        assistantTranscript = `${assistantTranscript}${stripAnsi(chunk)}`;
      },
    };
    await runAgentPrompt(sessionId === undefined ? agentPrompt : { ...agentPrompt, sessionId });
    if (sessionRuntime !== undefined) {
      await appendSessionTurn(configRoot, sessionRuntime.currentId(), "assistant", assistantTranscript);
      await maybeAutoCompactSession(configRoot, sessionRuntime.currentId(), { summarizer: createLlmCompactSummarizer(config, configRoot) })
        .catch((error: unknown) => {
          if (error instanceof Error) {
            output.write(`auto compact skipped: ${error.message}\n`);
            return;
          }
          throw error;
        });
    }
    await recordGoalEvidence(configRoot, `Answered: ${truncateEvidence(text)}`);
    await continueGoalIfNeeded({
      config,
      configRoot,
      userText: text,
      assistantTranscript,
      write: (chunk) => output.write(chunk),
      cwd,
      ...(sessionRuntime === undefined ? {} : { sessionRuntime }),
    });
    return { config, shouldContinue: true };
  }

  const command = splitCommand(text);
  if (command === undefined) {
    return { config, shouldContinue: true };
  }

  switch (command.name) {
    case "/help":
      printHelp();
      return { config, shouldContinue: true };
    case "/exit":
    case "/quit":
      output.write("Good night. Dream Code is ready when you are.\n");
      return { config, shouldContinue: false };
    case "/status":
      output.write(`${await formatStatusDashboard(configRoot, config, oneShotYolo)}\n`);
      return { config, shouldContinue: true };
    case "/doctor":
      output.write(`${summarizeDoctor(await runDoctor())}\n`);
      return { config, shouldContinue: true };
    case "/yolo": {
      const nextConfig = await togglePersistedYolo(configRoot);
      const effectiveMode = resolveEffectivePermissionMode(nextConfig, oneShotYolo);
      output.write(`${formatPermissionMode(effectiveMode, oneShotYolo)}\n`);
      return { config: nextConfig, shouldContinue: true };
    }
    case "/session":
      await showSessionMenu(configRoot, sessionRuntime, questioner);
      return { config, shouldContinue: true };
    case "/rename":
      await renameCurrentSession(configRoot, sessionRuntime, command.rest, questioner);
      return { config, shouldContinue: true };
    case "/provider":
      if (command.rest.trim() === "list") {
        await printProviders(configRoot);
        return { config, shouldContinue: true };
      }
      return {
        config: await switchProvider({
          config,
          configRoot,
          args: command.rest,
          questioner,
        }),
        shouldContinue: true,
      };
    case "/model":
      return {
        config: await configureModels({
          config,
          configRoot,
          args: command.rest,
          questioner,
        }),
        shouldContinue: true,
      };
    case "/login":
      return {
        config: await loginProvider({
          config,
          configRoot,
          args: command.rest,
          questioner,
        }),
        shouldContinue: true,
      };
    case "/skills":
      await showSkillMenu(configRoot, questioner);
      return { config, shouldContinue: true };
    case "/agents":
      await showAgentsMenu(config, configRoot, questioner, cwd);
      return { config, shouldContinue: true };
    case "/swarm":
      await runSwarmCommand({
        config,
        configRoot,
        args: command.rest,
        questioner,
        cwd,
        ...(sessionRuntime === undefined ? {} : { sessionId: sessionRuntime.currentId() }),
      });
      return { config, shouldContinue: true };
    case "/read":
      await printFile(command.rest);
      return { config, shouldContinue: true };
    case "/write":
      await maybeWriteFile(command.rest, mode, questioner);
      return { config, shouldContinue: true };
    case "/edit":
      await maybeEditFile(command.rest, mode, questioner);
      return { config, shouldContinue: true };
    case "/shell":
      await maybeRunShell(command.rest, mode, questioner);
      return { config, shouldContinue: true };
    default:
      if (await runUtilityCommand({
        config,
        configRoot,
        command: command.name,
        rest: command.rest,
        questioner,
        sessionRuntime,
        cwd,
        ...(signal === undefined ? {} : { signal }),
      })) {
        return { config, shouldContinue: true };
      }
      output.write(`unknown command: ${command.name}\n`);
      return { config, shouldContinue: true };
  }
}

function truncateEvidence(text: string): string {
  const normalized = text.trim().replace(/\s+/gu, " ");
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}
