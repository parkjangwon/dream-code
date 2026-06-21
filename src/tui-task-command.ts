import { ansi, paint } from "./ansi.js";
import { appendTask, formatTasks } from "./workspace-state.js";
import { parseTaskStatus, updateTaskStatus } from "./task-ledger.js";

export async function runTasksCommand(root: string, rest: string): Promise<string> {
  const trimmed = rest.trim();
  if (trimmed.length === 0) {
    return `${await formatTasks(root)}\n`;
  }

  const statusChange = parseStatusChange(trimmed);
  if (statusChange !== undefined) {
    const updated = await updateTaskStatus(root, statusChange.id, statusChange.status);
    const message = updated === undefined
      ? paint(`task not found: ${statusChange.id}`, ansi.yellow)
      : `${paint("task updated:", ansi.green)} ${updated.id} ${updated.status}`;
    return `${message}\n${await formatTasks(root)}\n`;
  }

  await appendTask(root, "Task", trimmed);
  return `${paint("task added", ansi.green)}\n${await formatTasks(root)}\n`;
}

function parseStatusChange(text: string): { readonly id: string; readonly status: NonNullable<ReturnType<typeof parseTaskStatus>> } | undefined {
  const [statusText, id] = text.split(/\s+/u);
  const status = parseTaskStatus(statusText ?? "");
  if (status === undefined || id === undefined) {
    return undefined;
  }
  return { status, id };
}
