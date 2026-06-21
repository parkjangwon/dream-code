import { dreamingOutputSchema, type DreamingInput, type DreamingSummarizer } from "./dreaming.js";
import { streamChatCompletion, type ChatMessage } from "./llm-provider.js";
import { selectModelForPrompt } from "./model-routing.js";
import type { DreamConfig } from "./config.js";

export function createLlmDreamingSummarizer(config: DreamConfig, configRoot: string): DreamingSummarizer {
  return async (input) => {
    let output = "";
    await streamChatCompletion({
      selectedModel: selectModelForPrompt(config.model, "dreaming consolidate durable session memory", "low"),
      configRoot,
      messages: dreamingMessages(input),
      onToken: (token) => {
        output = `${output}${token}`;
      },
    });
    return dreamingOutputSchema.parse(parseJsonObject(output)).memories;
  };
}

function dreamingMessages(input: DreamingInput): readonly ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are Dream Code's hidden Dreaming memory consolidator.",
        "Extract only durable lessons that should improve future coding sessions.",
        "Prefer user preferences, project truths, mistakes to avoid, and repeatable workflow recipes.",
        "Ignore temporary chatter, one-off status updates, secrets, credentials, and raw logs.",
        "Do not store environment-dependent failures, missing local binaries, transient provider errors, or negative tool claims that may become stale.",
        "If a failure produced a reusable fix, store the fix pattern instead of the failure.",
        "Return strict JSON only: {\"memories\":[{\"kind\":\"user-preference\",\"title\":\"...\",\"body\":\"...\"}]}",
        "Allowed kind values: project-truth, user-preference, mistake-to-avoid, workflow-recipe.",
        "Return at most 5 memories. Return an empty memories array when nothing is durable.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Session: ${input.title}`,
        `Workspace: ${input.directory}`,
        `Updated: ${input.updatedAt}`,
        "",
        "Transcript:",
        input.transcript,
      ].join("\n"),
    },
  ];
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) {
    return {};
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}
