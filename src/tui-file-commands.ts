import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import { splitCommand } from "./command-parser.js";
import type { PermissionMode } from "./config.js";
import { riskyShellReason } from "./shell-safety.js";
import type { Questioner } from "./tui-workspace-commands.js";
import {
  readWorkspaceFile,
  replaceInWorkspaceFile,
  runShellCommand,
  writeWorkspaceFile,
} from "./workspace-tools.js";

export async function printFile(path: string): Promise<void> {
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

export async function maybeWriteFile(
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

export async function maybeEditFile(
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

export async function maybeRunShell(
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
  const risk = riskyShellReason(command);
  if (risk !== undefined) {
    output.write(`${paint("risk:", ansi.yellow)} ${risk}\n`);
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
