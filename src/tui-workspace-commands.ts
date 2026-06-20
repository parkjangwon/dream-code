import { cwd as currentWorkingDirectory, stdout as output } from "node:process";

import { runAgentPrompt } from "./agent-runner.js";
import { stripAnsi } from "./ansi.js";
import { splitCommand } from "./command-parser.js";
import {
  defaultConfigRoot,
  resolveEffectivePermissionMode,
  type DreamConfig,
} from "./config.js";
import { runHookEvent } from "./hooks.js";
import { appendSessionTurn } from "./session-store.js";
import { maybeAutoCompactSession } from "./session-actions.js";
import { showAgentsMenu } from "./tui-agent-commands.js";
import { maybeEditFile, maybeRunShell, maybeWriteFile, printFile } from "./tui-file-commands.js";
import { configureModels } from "./tui-model-commands.js";
import type { PickerOptions } from "./tui-picker.js";
import { loginProvider, printProviders } from "./tui-provider-commands.js";
import { switchProvider } from "./tui-provider-switch.js";
import type { SessionRuntime } from "./tui-session-commands.js";
import type { SkillManagerOptions } from "./tui-skill-manager.js";
import { showSkillMenu } from "./tui-skill-commands.js";
import { runSwarmCommand } from "./tui-swarm-commands.js";
import { runUtilityCommand } from "./tui-utility-commands.js";

export type CommandResult = {
  readonly config: DreamConfig;
  readonly shouldContinue: boolean;
};

export type Questioner = {
  readonly question: (prompt: string) => Promise<string>;
  readonly secret?: (prompt: string) => Promise<string>;
  readonly select?: (options: PickerOptions) => Promise<string | undefined>;
  readonly manageSkills?: (options: SkillManagerOptions) => Promise<readonly string[] | undefined>;
};

export async function runWorkspaceCommand(
  text: string,
  config: DreamConfig,
  oneShotYolo: boolean,
  questioner: Questioner,
  configRoot = defaultConfigRoot(),
  sessionRuntime?: SessionRuntime,
  cwd = currentWorkingDirectory(),
): Promise<CommandResult> {
  const result = await runWorkspaceCommandBody(text, config, oneShotYolo, questioner, configRoot, sessionRuntime, cwd);
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
      write: (chunk: string) => {
        output.write(chunk);
        assistantTranscript = `${assistantTranscript}${stripAnsi(chunk)}`;
      },
    };
    await runAgentPrompt(sessionId === undefined ? agentPrompt : { ...agentPrompt, sessionId });
    if (sessionRuntime !== undefined) {
      await appendSessionTurn(configRoot, sessionRuntime.currentId(), "assistant", assistantTranscript);
      await maybeAutoCompactSession(configRoot, sessionRuntime.currentId());
    }
    return { config, shouldContinue: true };
  }

  const command = splitCommand(text);
  if (command === undefined) {
    return { config, shouldContinue: true };
  }

  switch (command.name) {
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
      })) {
        return { config, shouldContinue: true };
      }
      output.write(`unknown command: ${command.name}\n`);
      return { config, shouldContinue: true };
  }
}
