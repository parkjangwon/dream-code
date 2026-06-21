import type { ChatMessage } from "./llm-provider.js";
import { drainInboxMessages } from "./inbox-store.js";

export async function appendActorInboxMessages(root: string, actorId: string, messages: readonly ChatMessage[]): Promise<readonly ChatMessage[]> {
  const inbox = await drainInboxMessages(root, actorId);
  if (inbox.length === 0) {
    return messages;
  }
  return [
    ...messages,
    {
      role: "user",
      content: [
        "New instructions were delivered to this actor inbox.",
        ...inbox.map((message) => `- ${message.type}: ${message.content}`),
      ].join("\n"),
    },
  ];
}
