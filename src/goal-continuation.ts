import { runAgentPrompt } from "./agent-runner.js";
import { ansi, paint, stripAnsi } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { completeGoalState, loadGoalState, recordGoalEvidence } from "./goal-state.js";
import { runGoalJudge, type GoalJudgeTurn, type GoalJudgeVerdict } from "./goal-judge.js";
import { appendSessionTurn } from "./session-store.js";
import type { SessionRuntime } from "./tui-session-commands.js";

export type GoalContinuationOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly userText: string;
  readonly assistantTranscript: string;
  readonly write: (text: string) => void;
  readonly cwd: string;
  readonly sessionRuntime?: SessionRuntime;
  readonly judge?: (transcript: readonly GoalJudgeTurn[]) => Promise<GoalJudgeVerdict>;
  readonly runContinuation?: (prompt: string) => Promise<string>;
};

export async function continueGoalIfNeeded(options: GoalContinuationOptions): Promise<boolean> {
  const goal = await loadGoalState(options.configRoot);
  if (goal === undefined || goal.status !== "active" || options.assistantTranscript.trim().length === 0) {
    return false;
  }
  const transcript: readonly GoalJudgeTurn[] = [
    { role: "user", content: options.userText },
    { role: "assistant", content: options.assistantTranscript },
  ];
  const verdict = await (options.judge ?? ((turns) => runGoalJudge({ config: options.config, configRoot: options.configRoot, goal: goal.title, transcript: turns })))(transcript);
  if (verdict.satisfied && verdict.confidence >= 0.7) {
    await completeGoalState(options.configRoot, `Judge: ${verdict.reason}`);
    return false;
  }
  await recordGoalEvidence(options.configRoot, `Judge: ${verdict.reason}`);
  if (!shouldContinue(verdict)) {
    return false;
  }
  const prompt = buildGoalContinuationPrompt(goal.title, verdict.reason);
  options.write(`${paint("goal continuing:", ansi.yellow)} ${verdict.reason}\n`);
  await appendSyntheticTurn(options, "user", prompt);
  const continuation = await (options.runContinuation ?? ((nextPrompt) => runDefaultContinuation(options, nextPrompt)))(prompt);
  await appendSyntheticTurn(options, "assistant", continuation);
  await recordGoalEvidence(options.configRoot, "Auto continuation turn completed.");
  return true;
}

export function buildGoalContinuationPrompt(goal: string, reason: string): string {
  return [
    "Continue the active Dream Code goal. Do not stop at analysis.",
    `Goal: ${goal}`,
    `Judge says incomplete because: ${reason}`,
    "Take the next concrete action, update evidence, and report what remains.",
  ].join("\n");
}

function shouldContinue(verdict: GoalJudgeVerdict): boolean {
  return !verdict.satisfied && verdict.confidence > 0 && !verdict.reason.startsWith("Goal judge skipped:");
}

async function runDefaultContinuation(options: GoalContinuationOptions, prompt: string): Promise<string> {
  let transcript = "";
  await runAgentPrompt({
    config: options.config,
    configRoot: options.configRoot,
    cwd: options.cwd,
    prompt,
    runLabel: "Goal",
    ...(options.sessionRuntime === undefined ? {} : { sessionId: options.sessionRuntime.currentId() }),
    write: (chunk) => {
      transcript = `${transcript}${stripAnsi(chunk)}`;
      options.write(chunk);
    },
  });
  return transcript.trim();
}

async function appendSyntheticTurn(options: GoalContinuationOptions, role: "user" | "assistant", content: string): Promise<void> {
  if (options.sessionRuntime !== undefined && content.trim().length > 0) {
    await appendSessionTurn(options.configRoot, options.sessionRuntime.currentId(), role, content);
  }
}
