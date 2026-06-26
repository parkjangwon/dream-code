import { restoreLatestFileCheckpoint } from "./file-history.js";
import { formatSessionActionResult, copyLastAssistantResponse, exportCurrentSession } from "./session-actions.js";
import { clearSessionTurns } from "./session-store.js";
import type { UtilityCommandOptions } from "./tui-utility-commands.js";

export async function restOrAsk(rest: string, prompt: string, questioner: UtilityCommandOptions["questioner"]): Promise<string> {
  return rest.trim().length > 0 ? rest.trim() : questioner.question(prompt);
}

export function currentSessionId(options: UtilityCommandOptions): string {
  return options.sessionRuntime?.currentId() ?? "";
}

export async function clearActiveSession(options: UtilityCommandOptions): Promise<string> {
  const sessionId = currentSessionId(options);
  if (sessionId.length === 0) {
    return "clear skipped: no active session";
  }
  const session = await clearSessionTurns(options.configRoot, sessionId);
  if (session !== undefined) {
    options.sessionRuntime?.restore?.(session);
  }
  return session === undefined ? "clear skipped: active session not found" : "session cleared";
}

export async function restoreFile(options: UtilityCommandOptions): Promise<string> {
  const target = await restOrAsk(options.rest, "Restore file: ", options.questioner);
  if (target.trim().length === 0) {
    return "restore skipped: no file";
  }
  const path = await restoreLatestFileCheckpoint(target, options.cwd, options.configRoot);
  return `restored: ${path}`;
}

export async function copyCurrentSession(options: UtilityCommandOptions): Promise<string> {
  return await formatSessionActionResult(await copyLastAssistantResponse(options.configRoot, currentSessionId(options), copyOffset(options.rest)));
}

export async function exportSession(options: UtilityCommandOptions): Promise<string> {
  return await formatSessionActionResult(await exportCurrentSession(options.configRoot, currentSessionId(options)));
}

function copyOffset(rest: string): number {
  const parsed = Number.parseInt(rest.trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
