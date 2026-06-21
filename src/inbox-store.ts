import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

import { actorInboxPath, actorsRoot } from "./actor-record.js";

const inboxMessageSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  receiverActorId: z.string().min(1),
  senderActorId: z.string().min(1).optional(),
  type: z.enum(["user", "system", "agent"]),
  content: z.string(),
  createdAt: z.string(),
  deliveredAt: z.string().optional(),
});

export type InboxMessage = z.infer<typeof inboxMessageSchema>;

export type SendInboxMessageInput = {
  readonly id?: string;
  readonly receiverActorId: string;
  readonly senderActorId?: string;
  readonly type: InboxMessage["type"];
  readonly content: string;
};

export async function sendInboxMessage(root: string, input: SendInboxMessageInput): Promise<InboxMessage> {
  const now = new Date().toISOString();
  const message: InboxMessage = {
    version: 1,
    id: input.id ?? messageId(input.receiverActorId),
    receiverActorId: input.receiverActorId,
    type: input.type,
    content: input.content,
    createdAt: now,
    ...(input.senderActorId === undefined ? {} : { senderActorId: input.senderActorId }),
  };
  await saveInbox(root, [...await readInbox(root), message]);
  return message;
}

export async function drainInboxMessages(root: string, receiverActorId: string): Promise<readonly InboxMessage[]> {
  const messages = await readInbox(root);
  const now = new Date().toISOString();
  const drained: InboxMessage[] = [];
  const next = messages.map((message) => {
    if (message.receiverActorId !== receiverActorId || message.deliveredAt !== undefined) {
      return message;
    }
    const delivered = { ...message, deliveredAt: now };
    drained.push(delivered);
    return delivered;
  });
  await saveInbox(root, next);
  return drained;
}

async function readInbox(root: string): Promise<readonly InboxMessage[]> {
  try {
    return (await readFile(actorInboxPath(root), "utf8"))
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map(parseInboxLine)
      .filter(isInboxMessage);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function saveInbox(root: string, messages: readonly InboxMessage[]): Promise<void> {
  await mkdir(actorsRoot(root), { recursive: true, mode: 0o700 });
  const body = messages.map((message) => JSON.stringify(message)).join("\n");
  await writeFile(actorInboxPath(root), body.length === 0 ? "" : `${body}\n`, "utf8");
}

function parseInboxLine(line: string): InboxMessage | undefined {
  try {
    const parsedJson: unknown = JSON.parse(line);
    const parsed = inboxMessageSchema.safeParse(parsedJson);
    return parsed.success ? parsed.data : undefined;
  } catch (error) {
    return error instanceof SyntaxError ? undefined : raise(error);
  }
}

function messageId(receiverActorId: string): string {
  return `${receiverActorId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isInboxMessage(value: InboxMessage | undefined): value is InboxMessage {
  return value !== undefined;
}

function raise(error: unknown): never {
  throw error;
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
