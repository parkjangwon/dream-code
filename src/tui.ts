import { stdin as input, stdout as output } from "node:process";
import { createInterface, type Interface } from "node:readline/promises";

import { defaultConfigRoot, loadConfig, type DreamConfig } from "./config.js";
import { initializeDreamHome } from "./config-init.js";
import { startSession, type DreamSession } from "./session-store.js";
import { loadSkillSettings, skillEnabled } from "./skill-settings.js";
import { loadSkills, type DreamSkill } from "./skills.js";
import { dreamTerminalTitle, setTerminalTitle } from "./terminal-title.js";
import { slashCommands } from "./tui-commands.js";
import { readInteractiveAgentView } from "./tui-agent-view.js";
import { readInteractiveInput } from "./tui-input.js";
import { runWithEscInterrupt } from "./tui-interrupt.js";
import { dispatchTuiRunningCommand } from "./tui-running-command-dispatch.js";
import { readInteractivePicker } from "./tui-picker.js";
import { readInteractiveProviderManager } from "./tui-provider-manager.js";
import { renderHeader } from "./tui-render.js";
import { printShortcutGuide } from "./tui-shortcuts.js";
import type { SessionRuntime } from "./tui-session-commands.js";
import { readInteractiveSkillManager } from "./tui-skill-manager.js";
import { buildBottomStatusLines } from "./tui-status-bar.js";
import { finishInteractiveSessionDreaming } from "./tui-dreaming.js";
import { discoverFileMentionTargets } from "./file-mention-targets.js";
import { runWorkspaceCommand, type CommandResult, type Questioner } from "./tui-workspace-commands.js";

export type TuiOptions = {
  readonly oneShotYolo: boolean;
  readonly configRoot?: string;
};

export async function runTui(options: TuiOptions): Promise<void> {
  const configRoot = options.configRoot ?? defaultConfigRoot();
  await initializeDreamHome(configRoot);
  let config = await loadConfig(configRoot);
  setTerminalTitle(output, dreamTerminalTitle);
  renderHeader(config, options.oneShotYolo);

  const interactive = isInteractiveTerminal();
  if (interactive) {
    await runInteractiveLoop(config, options);
  } else {
    const terminal = createInterface({ input, output, terminal: false });
    try {
      await runPipedLoop(config, options, terminal);
    } finally {
      terminal.close();
    }
  }
}

async function runInteractiveLoop(
  initialConfig: DreamConfig,
  options: TuiOptions,
): Promise<DreamConfig> {
  let config = initialConfig;
  let history: readonly string[] = [];
  let currentSessionId = (await startSession(options.configRoot)).id;
  const sessionRuntime: SessionRuntime = {
    currentId: () => currentSessionId,
    switchTo: (sessionId) => {
      currentSessionId = sessionId;
    },
    restore: (session) => {
      currentSessionId = session.id;
      history = historyFromSession(session);
    },
  };
  let shouldContinue = true;
  while (shouldContinue) {
    const configRoot = options.configRoot ?? defaultConfigRoot();
    const statusLines = await buildBottomStatusLines({ config, configRoot, sessionId: currentSessionId, cwd: process.cwd(), oneShotYolo: options.oneShotYolo });
    const skills = await loadEnabledSkills(configRoot);
    const fileMentions = await discoverFileMentionTargets(process.cwd());
    const answer = await readInteractiveInput({
      prompt: "> ",
      history,
      commands: slashCommands,
      skills,
      fileMentions,
      statusLines,
      redrawHeader: () => {
        renderHeader(config, options.oneShotYolo);
      },
    });
    if (answer.kind === "cancel") {
      await finishInteractiveSessionDreaming(config, options, currentSessionId, (text) => output.write(text));
      return config;
    }
    history = appendHistory(history, answer.text);
    const questioner = interactiveQuestioner(config, options);
    const result = shouldUseEscInterrupt(answer.text)
      ? await runWithEscInterrupt(
        (signal, write) => handleInput(answer.text.trim(), config, options, questioner, sessionRuntime, signal, write),
        {
          onRunningCommand: (command, write) => dispatchTuiRunningCommand(command, {
            config,
            oneShotYolo: options.oneShotYolo,
            sessionId: currentSessionId,
            write,
            ...(options.configRoot === undefined ? {} : { configRoot: options.configRoot }),
          }),
        },
      )
      : await handleInput(answer.text.trim(), config, options, questioner, sessionRuntime);
    config = result.config;
    shouldContinue = result.shouldContinue;
  }
  await finishInteractiveSessionDreaming(config, options, currentSessionId, (text) => output.write(text));
  return config;
}

async function runPipedLoop(
  initialConfig: DreamConfig,
  options: TuiOptions,
  terminal: Interface,
): Promise<void> {
  let config = initialConfig;
  const questioner = nonInteractiveQuestioner();
  for await (const line of terminal) {
    const result = await handleInput(line.trim(), config, options, questioner);
    config = result.config;
    if (!result.shouldContinue) {
      return;
    }
  }
}

function nonInteractiveQuestioner(): Questioner {
  return {
    question: async () => "",
  };
}

function isInteractiveTerminal(): boolean {
  return input.isTTY === true && output.isTTY === true;
}

export async function handleInput(
  text: string,
  config: DreamConfig,
  options: TuiOptions,
  questioner: Questioner,
  sessionRuntime?: SessionRuntime,
  signal?: AbortSignal,
  write?: (text: string) => void,
): Promise<CommandResult> {
  if (text.length === 0) {
    return { config, shouldContinue: true };
  }

  if (text === "?") {
    printShortcutGuide();
    return { config, shouldContinue: true };
  }

  return runWorkspaceCommand(text, config, options.oneShotYolo, questioner, options.configRoot, sessionRuntime, process.cwd(), signal, write);
}

function shouldUseEscInterrupt(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && !trimmed.startsWith("/") && !trimmed.startsWith("!");
}

function interactiveQuestioner(config: DreamConfig, options: TuiOptions): Questioner {
  let wasCancelled = false;
  return {
    question: async (prompt) => {
      if (wasCancelled) {
        return "";
      }
      const answer = await readInteractiveInput({
        prompt,
        history: [],
        commands: [],
        redrawHeader: () => {
          renderHeader(config, options.oneShotYolo);
        },
        cancelOnEmptyBackspace: true,
      });
      wasCancelled = answer.kind === "cancel";
      return answer.kind === "submit" ? answer.text : "";
    },
    secret: async (prompt) => {
      if (wasCancelled) {
        return "";
      }
      const answer = await readInteractiveInput({
        prompt,
        history: [],
        commands: [],
        secret: true,
        redrawHeader: () => {
          renderHeader(config, options.oneShotYolo);
        },
        cancelOnEmptyBackspace: true,
      });
      wasCancelled = answer.kind === "cancel";
      return answer.kind === "submit" ? answer.text : "";
    },
    wasCancelled: () => wasCancelled,
    select: async (pickerOptions) => readInteractivePicker({
      ...pickerOptions,
      redrawHeader: () => {
        renderHeader(config, options.oneShotYolo);
      },
    }),
    manageProviders: async (providerOptions) => readInteractiveProviderManager({
      ...providerOptions,
      redrawHeader: () => {
        renderHeader(config, options.oneShotYolo);
      },
    }),
    manageSkills: async (skillOptions) => readInteractiveSkillManager({
      ...skillOptions,
      redrawHeader: () => {
        renderHeader(config, options.oneShotYolo);
      },
    }),
    manageAgents: async (agentOptions) => readInteractiveAgentView({
      ...agentOptions,
      redrawHeader: () => {
        renderHeader(config, options.oneShotYolo);
      },
    }),
  };
}

function appendHistory(history: readonly string[], text: string): readonly string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return history;
  }
  if (history[history.length - 1] === trimmed) {
    return history;
  }
  return [...history, trimmed].slice(-100);
}

function historyFromSession(session: DreamSession): readonly string[] {
  return session.turns
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content)
    .slice(-100);
}

async function loadEnabledSkills(configRoot: string): Promise<readonly DreamSkill[]> {
  const settings = await loadSkillSettings(configRoot);
  return (await loadSkills()).filter((skill) => skillEnabled(settings, skill.name));
}
