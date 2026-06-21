import type { DreamConfig } from "./config.js";
import { streamChatCompletion, type ChatMessage } from "./llm-provider.js";
import { selectModelForPrompt } from "./model-routing.js";
import type { SessionCompactInput, SessionCompactSummarizer } from "./session-compact.js";

export function createLlmCompactSummarizer(config: DreamConfig, configRoot: string): SessionCompactSummarizer {
  return async (input) => {
    let output = "";
    await streamChatCompletion({
      selectedModel: selectModelForPrompt(config.model, "compact session context decisions risks next actions", "low"),
      configRoot,
      messages: compactMessages(input),
      onToken: (token) => {
        output = `${output}${token}`;
      },
    });
    return output;
  };
}

function compactMessages(input: SessionCompactInput): readonly ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are Dream Code's hidden context compact writer.",
        "Summarize the session for future coding turns. Be concise but preserve operational truth.",
        "Return Markdown with exactly these headings:",
        "Objective, Decisions, Completed Work, Open Work, Files And Artifacts, Risks, Next Actions.",
        "Do not include greetings or meta commentary.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Session objective: ${input.title}`,
        `Workspace: ${input.directory}`,
        `Updated: ${input.updatedAt}`,
        "",
        "Transcript:",
        input.transcript,
      ].join("\n"),
    },
  ];
}
