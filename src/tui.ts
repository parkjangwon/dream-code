import { stdin as input, stdout as output } from "node:process";
import { createInterface, type Interface } from "node:readline/promises";

import {
  loadConfig,
  resolveEffectivePermissionMode,
  togglePersistedYolo,
  type DreamConfig,
} from "./config.js";
import { runDoctor, summarizeDoctor } from "./doctor.js";
import { dreamTerminalTitle, setTerminalTitle } from "./terminal-title.js";
import { slashCommands } from "./tui-commands.js";
import { readInteractiveInput } from "./tui-input.js";
import { readInteractivePicker } from "./tui-picker.js";
import {
  formatPermissionMode,
  printHelp,
  printStatus,
  renderHeader,
} from "./tui-render.js";
import { printShortcutGuide } from "./tui-shortcuts.js";
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
  let config = await loadConfig(options.configRoot);
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
  let shouldContinue = true;
  while (shouldContinue) {
    const answer = await readInteractiveInput({
      prompt: "> ",
      history,
      commands: slashCommands,
      redrawHeader: () => {
        renderHeader(config, options.oneShotYolo);
      },
    });
    if (answer.kind === "cancel") {
      return config;
    }
    history = appendHistory(history, answer.text);
    const questioner = interactiveQuestioner(config, options);
    const result = await handleInput(answer.text.trim(), config, options, questioner);
    config = result.config;
    shouldContinue = result.shouldContinue;
  }
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
): Promise<CommandResult> {
  if (text.length === 0) {
    return { config, shouldContinue: true };
  }

  if (text === "?") {
    printShortcutGuide();
    return { config, shouldContinue: true };
  }

  if (text === "/help") {
    printHelp();
    return { config, shouldContinue: true };
  }

  if (text === "/quit") {
    output.write("Good night. Dream Code is ready when you are.\n");
    return { config, shouldContinue: false };
  }

  if (text === "/status") {
    printStatus(config, options.oneShotYolo);
    return { config, shouldContinue: true };
  }

  if (text === "/doctor") {
    output.write(`${summarizeDoctor(await runDoctor())}\n`);
    return { config, shouldContinue: true };
  }

  if (text === "/yolo") {
    const nextConfig = await togglePersistedYolo(options.configRoot);
    const effectiveMode = resolveEffectivePermissionMode(nextConfig, options.oneShotYolo);
    output.write(`${formatPermissionMode(effectiveMode, options.oneShotYolo)}\n`);
    return { config: nextConfig, shouldContinue: true };
  }

  return runWorkspaceCommand(text, config, options.oneShotYolo, questioner, options.configRoot);
}

function interactiveQuestioner(config: DreamConfig, options: TuiOptions): Questioner {
  return {
    question: async (prompt) => {
      const answer = await readInteractiveInput({
        prompt,
        history: [],
        commands: [],
        redrawHeader: () => {
          renderHeader(config, options.oneShotYolo);
        },
      });
      return answer.kind === "submit" ? answer.text : "";
    },
    secret: async (prompt) => {
      const answer = await readInteractiveInput({
        prompt,
        history: [],
        commands: [],
        secret: true,
        redrawHeader: () => {
          renderHeader(config, options.oneShotYolo);
        },
      });
      return answer.kind === "submit" ? answer.text : "";
    },
    select: async (pickerOptions) => readInteractivePicker({
      ...pickerOptions,
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
