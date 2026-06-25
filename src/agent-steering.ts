import type { ChatMessage } from "./llm-provider.js";

export type AgentSteering = {
  readonly drain: () => readonly string[];
};

export function appendSteeringMessages(
  messages: readonly ChatMessage[],
  steering: AgentSteering | undefined,
): readonly ChatMessage[] {
  const instructions = steering?.drain() ?? [];
  if (instructions.length === 0) {
    return messages;
  }
  return [
    ...messages,
    {
      role: "user",
      content: [
        "Live steering instructions were submitted by the user.",
        "Treat them as high-priority guidance for the next safe step.",
        ...instructions.map((instruction) => `- ${instruction}`),
      ].join("\n"),
    },
  ];
}
