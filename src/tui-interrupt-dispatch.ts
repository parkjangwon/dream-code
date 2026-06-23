import { ansi } from "./ansi.js";
import { interruptHint } from "./tui-interrupt-format.js";
import type { RunningCommand } from "./tui-running-command.js";

export type RunningOutputWriter = (text: string) => void;
export type RunningStatusWriter = (lines: readonly string[]) => void;
export type RunningCommandHandler = (
  command: RunningCommand,
  write: RunningOutputWriter,
  setStatusLines: RunningStatusWriter,
) => Promise<void> | void;

export async function dispatchRunningCommand(
  command: RunningCommand,
  onRunningCommand: RunningCommandHandler | undefined,
  controller: AbortController,
  write: RunningOutputWriter,
  setStatusLines: RunningStatusWriter,
): Promise<void> {
  if (command.kind === "ignore") {
    return;
  }
  if (command.kind === "interrupt") {
    write(interruptHint("interrupting agent run", ansi.red));
    controller.abort();
    return;
  }
  await onRunningCommand?.(command, write, setStatusLines);
  if (command.kind === "steer" && command.priority) {
    write(interruptHint("priority steering queued; interrupting current run", ansi.yellow));
    controller.abort();
  }
}
