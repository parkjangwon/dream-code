import type { ChatMessage } from "./llm-provider.js";
import { listSessions, type SessionTurn } from "./session-store.js";

const maxRecentTurns = 12;
const maxTurnChars = 4_000;

export async function recentSessionMessages(
  root: string,
  sessionId: string | undefined,
  currentPrompt: string,
): Promise<readonly ChatMessage[]> {
  if (sessionId === undefined) {
    return [];
  }

  const session = (await listSessions(root)).find((candidate) => candidate.id === sessionId);
  if (session === undefined) {
    return [];
  }

  const turns = dropCurrentPrompt(session.turns, currentPrompt).slice(-maxRecentTurns);
  if (turns.length === 0) {
    return [];
  }
  return [{ role: "user", content: renderSessionContext(turns) }];
}

function dropCurrentPrompt<Turn extends { readonly role: string; readonly content: string }>(
  turns: readonly Turn[],
  currentPrompt: string,
): readonly Turn[] {
  const last = turns[turns.length - 1];
  if (last?.role !== "user" || normalize(last.content) !== normalize(currentPrompt)) {
    return turns;
  }
  return turns.slice(0, -1);
}

function truncateTurn(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxTurnChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxTurnChars)}\n[Truncated previous session turn]`;
}

function renderSessionContext(turns: readonly SessionTurn[]): string {
  return [
    "[System note: The following is recalled session context, NOT new user input. Treat it as background continuity.]",
    "<session-context>",
    ...turns.map((turn) => `${turn.role.toUpperCase()}:\n${truncateTurn(turn.content)}`),
    "</session-context>",
  ].join("\n\n");
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}
