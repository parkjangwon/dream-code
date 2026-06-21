import { z } from "zod";

import type { DreamConfig } from "./config.js";
import {
  MissingProviderConfigError,
  ProviderProtocolError,
  ProviderRequestError,
  streamChatCompletion,
  type ChatMessage,
} from "./llm-provider.js";
import { selectModelForPrompt } from "./model-routing.js";

const goalJudgeVerdictSchema = z.object({
  satisfied: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
});

export type GoalJudgeTurn = {
  readonly role: "user" | "assistant";
  readonly content: string;
};

export type GoalJudgeInput = {
  readonly goal: string;
  readonly transcript: readonly GoalJudgeTurn[];
};

export type GoalJudgeVerdict = z.infer<typeof goalJudgeVerdictSchema>;

export type GoalJudgeRuntimeInput = GoalJudgeInput & {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly signal?: AbortSignal;
};

export function buildGoalJudgeMessages(input: GoalJudgeInput): readonly ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are an independent goal judge for Dream Code.",
        "Decide whether the active goal is truly satisfied by the transcript.",
        "Return only strict JSON: {\"satisfied\":boolean,\"confidence\":number,\"reason\":\"short reason\"}.",
        "Be skeptical. If evidence is missing, set satisfied=false.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Goal: ${input.goal}`,
        "",
        "Transcript:",
        summarizeGoalTranscript(input.transcript, 6_000),
      ].join("\n"),
    },
  ];
}

export function parseGoalJudgeVerdict(text: string): GoalJudgeVerdict {
  const parsedJson = parseJsonCandidate(text);
  if (parsedJson === undefined) {
    return unreadableVerdict();
  }
  const parsed = goalJudgeVerdictSchema.safeParse(parsedJson);
  return parsed.success ? parsed.data : unreadableVerdict();
}

export function summarizeGoalTranscript(
  transcript: readonly GoalJudgeTurn[],
  budgetChars = 6_000,
): string {
  const lines: string[] = [];
  let total = 0;
  for (const turn of [...transcript].reverse()) {
    const line = `- ${turn.role}: ${singleLine(turn.content)}`;
    if (total + line.length > budgetChars && lines.length > 0) {
      break;
    }
    lines.unshift(line);
    total += line.length;
  }
  return lines.join("\n");
}

export async function runGoalJudge(input: GoalJudgeRuntimeInput): Promise<GoalJudgeVerdict> {
  const selectedModel = selectModelForPrompt(input.config.model, `goal judge: ${input.goal}`, "low");
  let response = "";
  try {
    await streamChatCompletion({
      selectedModel,
      messages: buildGoalJudgeMessages(input),
      configRoot: input.configRoot,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      onToken: (token) => {
        response = `${response}${token}`;
      },
    });
    return parseGoalJudgeVerdict(response);
  } catch (error) {
    if (error instanceof MissingProviderConfigError || error instanceof ProviderRequestError || error instanceof ProviderProtocolError) {
      return { satisfied: false, confidence: 0, reason: `Goal judge skipped: ${error.message}` };
    }
    throw error;
  }
}

function parseJsonCandidate(text: string): unknown | undefined {
  const trimmed = text.trim();
  const candidate = trimmed.startsWith("{") ? trimmed : objectSlice(trimmed);
  if (candidate === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(candidate);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

function objectSlice(text: string): string | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start === -1 || end < start ? undefined : text.slice(start, end + 1);
}

function unreadableVerdict(): GoalJudgeVerdict {
  return {
    satisfied: false,
    confidence: 0,
    reason: "Goal judge returned an unreadable verdict.",
  };
}

function singleLine(text: string): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > 900 ? `${normalized.slice(0, 897)}...` : normalized;
}
