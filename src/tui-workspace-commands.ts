import { cwd as currentWorkingDirectory, stdout as output } from "node:process";

import { runAgentPrompt } from "./agent-runner.js";
import { ansi, paint, stripAnsi } from "./ansi.js";
import { splitCommand } from "./command-parser.js";
import {
  defaultConfigRoot,
  resolveEffectivePermissionMode,
  type DreamConfig,
  type PermissionMode,
} from "./config.js";
import { appendSessionTurn } from "./session-store.js";
import { showAgentsMenu } from "./tui-agent-commands.js";
import { configureModels } from "./tui-model-commands.js";
import type { PickerOptions } from "./tui-picker.js";
import { loginProvider, printProviders } from "./tui-provider-commands.js";
import { switchProvider } from "./tui-provider-switch.js";
import type { SessionRuntime } from "./tui-session-commands.js";
import type { SkillManagerOptions } from "./tui-skill-manager.js";
import { showSkillMenu } from "./tui-skill-commands.js";
import { runSwarmCommand } from "./tui-swarm-commands.js";
import { printScaffold } from "./tui-render.js";
import {
  readWorkspaceFile,
  replaceInWorkspaceFile,
  runShellCommand,
  writeWorkspaceFile,
} from "./workspace-tools.js";

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
    await runAgentPrompt({
      config,
      configRoot,
      prompt: text,
      write: (chunk) => {
        output.write(chunk);
        assistantTranscript = `${assistantTranscript}${stripAnsi(chunk)}`;
      },
    });
    if (sessionRuntime !== undefined) {
      await appendSessionTurn(configRoot, sessionRuntime.currentId(), "assistant", assistantTranscript);
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
    case "/goal":
    case "/plan":
    case "/interview":
    case "/team":
    case "/research":
    case "/lsp":
      printScaffold(command.name, command.rest, config);
      return { config, shouldContinue: true };
    default:
      output.write(`unknown command: ${command.name}\n`);
      return { config, shouldContinue: true };
  }
}

async function printFile(path: string): Promise<void> {
  if (path.length === 0) {
    output.write("usage: /read <path>\n");
    return;
  }

  const result = await readWorkspaceFile(path);
  output.write(`${paint(result.path, ansi.dim)} (${result.bytes} bytes)\n`);
  output.write(result.content);
  if (!result.content.endsWith("\n")) {
    output.write("\n");
  }
  if (result.truncated) {
    output.write(paint("truncated by token-saving read limit\n", ansi.yellow));
  }
}

async function maybeWriteFile(
  rest: string,
  mode: PermissionMode,
  questioner: Questioner,
): Promise<void> {
  const command = splitCommand(rest);
  if (command === undefined) {
    output.write("usage: /write <path> <text>\n");
    return;
  }
  if (!(await confirmWrite(`write ${command.name}`, mode, questioner))) {
    return;
  }
  const filePath = await writeWorkspaceFile(command.name, command.rest);
  output.write(`wrote ${filePath}\n`);
}

async function maybeEditFile(
  rest: string,
  mode: PermissionMode,
  questioner: Questioner,
): Promise<void> {
  const command = splitCommand(rest);
  const separator = " => ";
  if (command === undefined || !command.rest.includes(separator)) {
    output.write("usage: /edit <path> old text => new text\n");
    return;
  }

  const splitAt = command.rest.indexOf(separator);
  const searchText = command.rest.slice(0, splitAt);
  const replacementText = command.rest.slice(splitAt + separator.length);
  if (!(await confirmWrite(`edit ${command.name}`, mode, questioner))) {
    return;
  }
  const result = await replaceInWorkspaceFile(command.name, searchText, replacementText);
  output.write(result.replaced ? `edited ${result.path}\n` : `no match in ${result.path}\n`);
}

async function maybeRunShell(
  command: string,
  mode: PermissionMode,
  questioner: Questioner,
): Promise<void> {
  if (command.length === 0) {
    output.write("usage: /shell <command>\n");
    return;
  }
  if (!(await confirmWrite(`run shell: ${command}`, mode, questioner))) {
    return;
  }
  const code = await runShellCommand(command);
  output.write(`exit ${code}\n`);
}

async function confirmWrite(
  label: string,
  mode: PermissionMode,
  questioner: Questioner,
): Promise<boolean> {
  if (mode === "yolo") {
    return true;
  }

  const answer = await questioner.question(`${label}? [y/N] `);
  return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
}
