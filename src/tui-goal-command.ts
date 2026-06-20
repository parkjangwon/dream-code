import { stdout as output } from "node:process";

import { runAgentPrompt } from "./agent-runner.js";
import { ansi, paint } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { clearGoalState, completeGoalState, formatGoalStatus, startGoalState } from "./goal-state.js";
import { appendTask, appendWorkflowNote } from "./workspace-state.js";

export type GoalCommandOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly rest: string;
  readonly write?: (text: string) => void;
};

export async function runGoalCommand(options: GoalCommandOptions): Promise<void> {
  const rest = options.rest.trim();
  if (rest.length === 0) {
    output.write(`${await formatGoalStatus(options.configRoot)}\n`);
    return;
  }
  if (rest === "clear") {
    output.write(await clearGoalState(options.configRoot) ? "goal cleared\n" : "goal already clear\n");
    return;
  }
  if (rest === "done" || rest.startsWith("done ")) {
    const note = rest.slice("done".length).trim();
    const state = await completeGoalState(options.configRoot, note);
    output.write(state === undefined ? "goal skipped: no active goal\n" : `${paint("goal complete:", ansi.green)} ${state.title}\n`);
    return;
  }

  const state = await startGoalState(options.configRoot, rest);
  const filePath = await appendWorkflowNote(options.configRoot, "goals.md", "Goal", rest);
  await appendTask(options.configRoot, "Goal", rest);
  output.write(`${paint("goal saved:", ansi.green)} ${paint(filePath, ansi.blue)}\n`);
  await runAgentPrompt({
    config: options.config,
    configRoot: options.configRoot,
    prompt: [
      "Goal mode: drive this goal to a verifiable outcome.",
      "Produce success criteria, risks, a task breakdown, and the next concrete action.",
      `Active goal: ${state.title}`,
    ].join("\n"),
    write: options.write ?? ((chunk) => output.write(chunk)),
  });
}
