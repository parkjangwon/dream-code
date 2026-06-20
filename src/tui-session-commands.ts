import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import {
  listSessions,
  renameSession,
  type DreamSession,
} from "./session-store.js";
import type { PickerOptions } from "./tui-picker.js";

export type SessionRuntime = {
  readonly currentId: () => string;
  readonly switchTo: (sessionId: string) => void;
  readonly restore?: (session: DreamSession) => void;
};

export type SessionQuestioner = {
  readonly question: (prompt: string) => Promise<string>;
  readonly select?: (options: PickerOptions) => Promise<string | undefined>;
};

export async function showSessionMenu(
  configRoot: string,
  runtime: SessionRuntime | undefined,
  questioner: SessionQuestioner,
): Promise<void> {
  const sessions = await listSessions(configRoot);
  if (sessions.length === 0) {
    output.write("no saved sessions\n");
    return;
  }

  if (questioner.select !== undefined) {
    const selected = await questioner.select({
      title: "Sessions",
      choices: sessions.map((session) => ({
        value: session.id,
        label: session.name,
        description: sessionDescription(session, runtime),
        keywords: [session.name, session.summary, session.directory],
      })),
    });
    if (selected !== undefined) {
      const session = selectedSession(sessions, selected);
      if (session !== undefined) {
        restoreRuntimeSession(runtime, session);
        output.write(`session: ${session.name}\n`);
        output.write(formatSessionTranscript(session));
      }
    }
    return;
  }

  output.write(formatSessionList(sessions, runtime));
}

export async function renameCurrentSession(
  configRoot: string,
  runtime: SessionRuntime | undefined,
  args: string,
  questioner: SessionQuestioner,
): Promise<void> {
  if (runtime === undefined) {
    output.write("session rename is available in TUI mode\n");
    return;
  }

  const name = args.trim().length > 0 ? args.trim() : await questioner.question("Session name: ");
  const renamed = await renameSession(configRoot, runtime.currentId(), name);
  output.write(renamed === undefined ? "session rename cancelled\n" : `renamed session: ${renamed.name}\n`);
}

function formatSessionList(sessions: readonly DreamSession[], runtime: SessionRuntime | undefined): string {
  const currentId = runtime?.currentId();
  const lines = [`${paint("Sessions", ansi.accent)}\n`];
  for (const session of sessions) {
    const marker = session.id === currentId ? paint(">", ansi.accent) : " ";
    lines.push(`${marker} ${session.name} ${paint(session.summary, ansi.dim)}\n`);
  }
  return lines.join("");
}

function sessionDescription(session: DreamSession, runtime: SessionRuntime | undefined): string {
  const current = session.id === runtime?.currentId() ? "current " : "";
  return `${current}${session.summary}`;
}

function selectedSession(sessions: readonly DreamSession[], sessionId: string): DreamSession | undefined {
  return sessions.find((session) => session.id === sessionId);
}

function restoreRuntimeSession(runtime: SessionRuntime | undefined, session: DreamSession): void {
  runtime?.switchTo(session.id);
  runtime?.restore?.(session);
}

function formatSessionTranscript(session: DreamSession): string {
  if (session.turns.length === 0) {
    return "";
  }

  const lines = [paint("Transcript", ansi.dim), "\n"];
  for (const turn of session.turns) {
    switch (turn.role) {
      case "user":
        lines.push(`${paint(">", ansi.accent)} ${turn.content}\n`);
        break;
      case "assistant":
        lines.push(`${paint("Dream", ansi.green)}\n${formatAssistantTurn(turn.content)}\n`);
        break;
      default:
        assertNever(turn.role);
    }
  }
  return lines.join("");
}

function formatAssistantTurn(content: string): string {
  return content
    .trimEnd()
    .split(/\r?\n/u)
    .map((line) => `${paint("│", ansi.dim)} ${line}`)
    .join("\n");
}

function assertNever(value: never): never {
  throw new Error(`Unhandled session turn role: ${value}`);
}
