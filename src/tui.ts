import { stdin as input, stdout as output } from "node:process";
import { createInterface, type Interface } from "node:readline/promises";

import {
  defaultConfigRoot,
  loadConfig,
  type DreamConfig,
} from "./config.js";
import { initializeDreamHome } from "./config-init.js";
import { startSession, type DreamSession } from "./session-store.js";
import { dreamTerminalTitle, setTerminalTitle } from "./terminal-title.js";
import { slashCommands } from "./tui-commands.js";
import { readInteractiveInput } from "./tui-input.js";
import {
  renderHeader,
} from "./tui-render.js";
import { startFullscreenSession, type ResizeSubscriber } from "./tui-fullscreen.js";
import { printShortcutGuide } from "./tui-shortcuts.js";
import type { SessionRuntime } from "./tui-session-commands.js";
import { buildBottomStatusLines } from "./tui-status-bar.js";
import { finishInteractiveSessionDreaming } from "./tui-dreaming.js";
import { loadEnabledSkills } from "./tui-enabled-skills.js";
import { discoverFileMentionTargets } from "./file-mention-targets.js";
import { interactiveQuestioner, nonInteractiveQuestioner } from "./tui-interactive-questioner.js";
import {
  runWorkspaceCommand,
  type CommandResult,
  type Questioner,
} from "./tui-workspace-commands.js";

export type TuiOptions = {
  readonly oneShotYolo: boolean;
  readonly configRoot?: string;
};

export async function runTui(options: TuiOptions): Promise<void> {
  const configRoot = options.configRoot ?? defaultConfigRoot();
  await initializeDreamHome(configRoot);
  let config = await loadConfig(configRoot);
  setTerminalTitle(output, dreamTerminalTitle);

  const interactive = isInteractiveTerminal();
  if (interactive) {
    let fullscreenConfig = config;
    const fullscreen = startFullscreenSession({
      repaint: () => {
        renderHeader(fullscreenConfig, options.oneShotYolo);
      },
    });
    try {
      config = await runInteractiveLoop(config, options, (nextConfig) => {
        fullscreenConfig = nextConfig;
      }, fullscreen.onResize);
    } finally {
      fullscreen.dispose();
    }
  } else {
    renderHeader(config, options.oneShotYolo);
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
  onConfigChange: (config: DreamConfig) => void = () => {},
  onResize?: ResizeSubscriber,
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
  let queuedInputs: readonly string[] = [];
  while (shouldContinue) {
    const configRoot = options.configRoot ?? defaultConfigRoot();
    const queuedInput = queuedInputs[0];
    const answer = queuedInput === undefined
      ? await readRootInput(config, options, configRoot, currentSessionId, history, onResize)
      : { kind: "submit", text: queuedInput } satisfies Awaited<ReturnType<typeof readInteractiveInput>>;
    queuedInputs = queuedInput === undefined ? queuedInputs : queuedInputs.slice(1);
    if (answer.kind === "cancel") {
      await finishInteractiveSessionDreaming(config, options, currentSessionId, (text) => output.write(text));
      return config;
    }
    history = appendHistory(history, answer.text);
    const questioner = interactiveQuestioner(config, options, onResize);
    const result = await handleInput(answer.text.trim(), config, options, questioner, sessionRuntime, undefined, onResize);
    config = result.config;
    onConfigChange(config);
    shouldContinue = result.shouldContinue;
    queuedInputs = result.queuedInputs === undefined ? queuedInputs : [...queuedInputs, ...result.queuedInputs];
  }
  await finishInteractiveSessionDreaming(config, options, currentSessionId, (text) => output.write(text));
  return config;
}

async function readRootInput(
  config: DreamConfig,
  options: TuiOptions,
  configRoot: string,
  currentSessionId: string,
  history: readonly string[],
  onResize?: ResizeSubscriber,
): Promise<Awaited<ReturnType<typeof readInteractiveInput>>> {
  const statusLines = await buildBottomStatusLines({ config, configRoot, sessionId: currentSessionId, cwd: process.cwd(), oneShotYolo: options.oneShotYolo });
  const skills = await loadEnabledSkills(configRoot);
  const fileMentions = await discoverFileMentionTargets(process.cwd());
  return readInteractiveInput({
    prompt: "> ",
    history,
    commands: slashCommands,
    skills,
    fileMentions,
    statusLines,
    redrawHeader: () => {
      renderHeader(config, options.oneShotYolo);
    },
    echoSubmitted: false,
    ...(onResize === undefined ? {} : { onResize }),
  });
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
  resize?: ResizeSubscriber,
): Promise<CommandResult> {
  if (text.length === 0) {
    return { config, shouldContinue: true };
  }

  if (text === "?") {
    printShortcutGuide();
    return { config, shouldContinue: true };
  }

  return runWorkspaceCommand(text, config, options.oneShotYolo, questioner, options.configRoot, sessionRuntime, process.cwd(), signal, resize);
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
