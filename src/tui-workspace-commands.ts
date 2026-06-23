import { cwd as currentWorkingDirectory, stdout as output } from "node:process";

import { splitCommand } from "./command-parser.js";
import {
  defaultConfigRoot,
  resolveEffectivePermissionMode,
  togglePersistedYolo,
  type DreamConfig,
} from "./config.js";
import { runDoctor, summarizeDoctor } from "./doctor.js";
import { runHookEvent } from "./hooks.js";
import { runLoopCommand } from "./tui-loop-command.js";
import { showAgentsMenu } from "./tui-agent-commands.js";
import { runAgentTextPrompt } from "./tui-agent-prompt-flow.js";
import { enableAutoRouting } from "./tui-auto-routing-command.js";
import { maybeEditFile, maybeRunShell, maybeWriteFile, printFile } from "./tui-file-commands.js";
import { configureModels } from "./tui-model-commands.js";
import { runNotificationsCommand } from "./tui-notification-command.js";
import { runCronCommand } from "./tui-cron-command.js";
import { runPermissionCommand } from "./tui-permission-command.js";
import { loginProvider, printProviders } from "./tui-provider-commands.js";
import { switchProvider } from "./tui-provider-switch.js";
import { renameCurrentSession, showSessionMenu, type SessionRuntime } from "./tui-session-commands.js";
import { showSkillMenu } from "./tui-skill-commands.js";
import { formatPermissionMode } from "./tui-render.js";
import { runSwarmCommand } from "./tui-swarm-commands.js";
import { runUtilityCommand } from "./tui-utility-commands.js";
import { formatStatusDashboard } from "./status-dashboard.js";
import { runPluginCommand } from "./tui-plugin-command.js";
import { isSkillInvocation } from "./tui-skill-invocation.js";
import type { CommandResult, Questioner } from "./tui-questioner.js";
export type { CommandResult, Questioner } from "./tui-questioner.js";

export async function runWorkspaceCommand(
  text: string,
  config: DreamConfig,
  oneShotYolo: boolean,
  questioner: Questioner,
  configRoot = defaultConfigRoot(),
  sessionRuntime?: SessionRuntime,
  cwd = currentWorkingDirectory(),
  signal?: AbortSignal,
  write?: (text: string) => void,
): Promise<CommandResult> {
  const result = await runWorkspaceCommandBody(text, config, oneShotYolo, questioner, configRoot, sessionRuntime, cwd, signal, write);
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
  write: ((text: string) => void) | undefined,
): Promise<CommandResult> {
  const mode = resolveEffectivePermissionMode(config, oneShotYolo);

  if (text.startsWith("!")) {
    await maybeRunShell(text.slice(1).trim(), mode, questioner);
    return { config, shouldContinue: true };
  }

  if (!text.startsWith("/")) {
    return runAgentTextPrompt({
      text,
      config,
      configRoot,
      questioner,
      cwd,
      ...(sessionRuntime === undefined ? {} : { sessionRuntime }),
      ...(signal === undefined ? {} : { signal }),
      ...(write === undefined ? {} : { write }),
    });
  }

  const command = splitCommand(text);
  if (command === undefined) {
    return { config, shouldContinue: true };
  }

  switch (command.name) {
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
    case "/cron":
      await runCronCommand({ config, configRoot, args: command.rest, questioner, cwd });
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
        await printProviders(config, configRoot);
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
    case "/notifications": {
      const result = await runNotificationsCommand(config, configRoot, command.rest);
      output.write(result.output);
      return { config: result.config, shouldContinue: true };
    }
    case "/permission": {
      const result = await runPermissionCommand(config, configRoot, command.rest, oneShotYolo);
      output.write(result.output);
      return { config: result.config, shouldContinue: true };
    }
    case "/plugin":
      output.write(await runPluginCommand(configRoot, command.rest, cwd));
      return { config, shouldContinue: true };
    case "/auto":
      return {
        config: await enableAutoRouting({
          config,
          configRoot,
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
    case "/loop":
      await runLoopCommand({
        config,
        configRoot,
        command: command.name,
        rest: command.rest,
        questioner,
        cwd,
        oneShotYolo,
        ...(sessionRuntime === undefined ? {} : { sessionRuntime }),
        ...(signal === undefined ? {} : { signal }),
      });
      return { config, shouldContinue: true };
    case "/skills":
      await showSkillMenu(configRoot, questioner);
      return { config, shouldContinue: true };
    case "/agents":
      await showAgentsMenu(config, configRoot, questioner, cwd, command.rest);
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
        oneShotYolo,
        ...(signal === undefined ? {} : { signal }),
      })) {
        return { config, shouldContinue: true };
      }
      if (await isSkillInvocation(configRoot, cwd, command.name)) {
        return runAgentTextPrompt({
          text,
          config,
          configRoot,
          questioner,
          cwd,
          ...(sessionRuntime === undefined ? {} : { sessionRuntime }),
          ...(signal === undefined ? {} : { signal }),
          ...(write === undefined ? {} : { write }),
        });
      }
      output.write(`unknown command: ${command.name}\n`);
      return { config, shouldContinue: true };
  }
}
