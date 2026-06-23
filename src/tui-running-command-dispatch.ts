import { ansi, paint } from "./ansi.js";
import { defaultConfigRoot, type DreamConfig } from "./config.js";
import { formatStatusDashboard } from "./status-dashboard.js";
import { formatAgentsOverview } from "./tui-agent-commands.js";
import {
  queueReplyMessage,
  queueSteeringMessage,
  type RunningCommand,
} from "./tui-running-command.js";

export type RunningCommandDispatchOptions = {
  readonly config: DreamConfig;
  readonly configRoot?: string;
  readonly oneShotYolo: boolean;
  readonly sessionId: string;
  readonly write: (text: string) => void;
  readonly setStatusLines: (lines: readonly string[]) => void;
};

export async function dispatchTuiRunningCommand(
  command: RunningCommand,
  options: RunningCommandDispatchOptions,
): Promise<void> {
  const configRoot = options.configRoot ?? defaultConfigRoot();
  switch (command.kind) {
    case "agents":
      options.setStatusLines(linesForPanel(await formatAgentsOverview(configRoot)));
      return;
    case "status":
      options.setStatusLines(linesForPanel(await formatStatusDashboard(configRoot, options.config, options.oneShotYolo)));
      return;
    case "steer":
      writeSteeringResult(
        options.write,
        await queueSteeringMessage(configRoot, options.sessionId, command.text, command.priority),
        command.priority,
      );
      return;
    case "reply":
      writeReplyResult(options.write, await queueReplyMessage(configRoot, command.actorId, command.text), command.actorId);
      return;
    case "unknown":
      options.write(`\n${paint(`unknown running command: /${command.name}`, ansi.yellow)}\n`);
      return;
    case "ignore":
    case "interrupt":
      return;
    default:
      return assertNever(command);
  }
}

function linesForPanel(text: string): readonly string[] {
  return text.replace(/\n$/u, "").split(/\r?\n/u);
}

function writeSteeringResult(
  write: (text: string) => void,
  target: Awaited<ReturnType<typeof queueSteeringMessage>>,
  priority: boolean,
): void {
  if (target === undefined) {
    write(`\n${paint("no running agent found for steering", ansi.yellow)}\n`);
    return;
  }
  const label = priority ? "queued priority steering" : "queued steering";
  write(`\n${paint(`${label}:`, ansi.green)} ${target.actor.name}\n`);
}

function writeReplyResult(
  write: (text: string) => void,
  target: Awaited<ReturnType<typeof queueReplyMessage>>,
  actorId: string,
): void {
  if (target === undefined) {
    write(`\n${paint(`agent not found: ${actorId}`, ansi.yellow)}\n`);
    return;
  }
  write(`\n${paint("queued inbox reply:", ansi.green)} ${target.actor.name}\n`);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected running command: ${JSON.stringify(value)}`);
}
