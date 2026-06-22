import { stdout as output } from "node:process";

import { readAgentRunPreview, type AgentBoardRow } from "./agent-board.js";
import { abortAgentRun, listAgentRuns } from "./agent-run-store.js";
import { ansi, paint } from "./ansi.js";
import { sendInboxMessage } from "./inbox-store.js";
import type { PickerOptions } from "./tui-picker.js";

export type AgentBoardActionQuestioner = {
  readonly question: (prompt: string) => Promise<string>;
  readonly select?: (options: PickerOptions) => Promise<string | undefined>;
};

const agentActionPrefix = "agent-action:";

export async function runAgentRowAction(
  configRoot: string,
  questioner: AgentBoardActionQuestioner,
  row: AgentBoardRow,
): Promise<void> {
  const selected = await questioner.select?.({
    title: row.name,
    choices: [
      { value: `${agentActionPrefix}peek`, label: "Peek", description: "Show the latest output", keywords: ["peek", "preview", "output"] },
      { value: `${agentActionPrefix}reply`, label: "Reply", description: "Queue a message for this agent", keywords: ["reply", "message", "inbox"] },
      { value: `${agentActionPrefix}stop`, label: "Stop", description: "Interrupt this agent run", keywords: ["stop", "cancel", "interrupt"] },
    ],
    initialValue: `${agentActionPrefix}peek`,
  });
  if (selected === `${agentActionPrefix}peek`) {
    await peekAgentRun(configRoot, row);
    return;
  }
  if (selected === `${agentActionPrefix}stop`) {
    stopAgentRun(row);
    return;
  }
  if (selected === `${agentActionPrefix}reply`) {
    await replyToAgent(configRoot, questioner, row);
  }
}

export async function peekAgentRun(configRoot: string, row: AgentBoardRow): Promise<void> {
  if (row.runId === undefined) {
    output.write(`${paint(row.name, ansi.bold)}\n${row.summary}\n`);
    return;
  }
  const run = (await listAgentRuns(configRoot, 50)).find((candidate) => candidate.id === row.runId);
  if (run === undefined) {
    output.write(`${paint(row.name, ansi.bold)}\n${row.summary}\n`);
    return;
  }
  output.write(`${paint(row.name, ansi.bold)} ${paint(row.status, ansi.dim)}\n${await readAgentRunPreview(run, 1_200)}\n`);
}

export async function replyToAgent(
  configRoot: string,
  questioner: AgentBoardActionQuestioner,
  row: AgentBoardRow,
): Promise<void> {
  if (row.actorId === undefined) {
    output.write(`${paint("cannot reply:", ansi.yellow)} ${row.name}\n`);
    return;
  }
  const message = (await questioner.question(`Message to ${row.name}: `)).trim();
  if (message.length === 0) {
    output.write("agent message cancelled\n");
    return;
  }
  await sendInboxMessage(configRoot, {
    receiverActorId: row.actorId,
    senderActorId: "main",
    type: "user",
    content: message,
  });
  output.write(`${paint("queued inbox message:", ansi.green)} ${row.name}\n`);
}

export function stopAgentRun(row: AgentBoardRow): void {
  if (row.runId === undefined || !abortAgentRun(row.runId)) {
    output.write(`${paint("not running:", ansi.yellow)} ${row.name}\n`);
    return;
  }
  output.write(`${paint("stop requested:", ansi.yellow)} ${row.name}\n`);
}
