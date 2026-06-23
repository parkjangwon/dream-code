import type { ActorRecord } from "./actor-record.js";
import { listActors } from "./actor-store.js";
import { sendInboxMessage } from "./inbox-store.js";

export type RunningCommand =
  | { readonly kind: "ignore" }
  | { readonly kind: "agents" }
  | { readonly kind: "status" }
  | { readonly kind: "interrupt" }
  | { readonly kind: "steer"; readonly text: string; readonly priority: boolean }
  | { readonly kind: "reply"; readonly actorId: string; readonly text: string }
  | { readonly kind: "unknown"; readonly name: string };

export type SteeringTarget = {
  readonly actor: ActorRecord;
  readonly messageId: string;
};

const slashCommandPattern = /^\/([^\s]+)(?:\s+([\s\S]*))?$/u;

export function parseRunningCommand(line: string): RunningCommand {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return { kind: "ignore" };
  }
  const slash = slashCommandPattern.exec(trimmed);
  if (slash === null) {
    return { kind: "steer", text: trimmed, priority: false };
  }

  const name = (slash[1] ?? "").toLowerCase();
  const rest = (slash[2] ?? "").trim();
  if (name === "agents") {
    return { kind: "agents" };
  }
  if (name === "status") {
    return { kind: "status" };
  }
  if (name === "interrupt" || name === "stop") {
    return { kind: "interrupt" };
  }
  if (name === "steer") {
    return rest.length === 0 ? { kind: "ignore" } : { kind: "steer", text: rest, priority: false };
  }
  if (name === "steer!") {
    return rest.length === 0 ? { kind: "interrupt" } : { kind: "steer", text: rest, priority: true };
  }
  if (name === "reply") {
    const [actorId, ...messageParts] = rest.split(/\s+/u);
    const text = messageParts.join(" ").trim();
    return actorId === undefined || actorId.length === 0 || text.length === 0
      ? { kind: "unknown", name }
      : { kind: "reply", actorId, text };
  }
  return { kind: "unknown", name };
}

export async function queueSteeringMessage(
  root: string,
  sessionId: string | undefined,
  text: string,
  priority = false,
): Promise<SteeringTarget | undefined> {
  const actor = await findActiveSteeringActor(root, sessionId);
  if (actor === undefined) {
    return undefined;
  }
  const message = await sendInboxMessage(root, {
    receiverActorId: actor.id,
    senderActorId: "main",
    type: priority ? "system" : "user",
    content: priority ? `Priority steering from the user: ${text}` : text,
  });
  return { actor, messageId: message.id };
}

export async function queueReplyMessage(
  root: string,
  actorId: string,
  text: string,
): Promise<SteeringTarget | undefined> {
  const actor = (await listActors(root, 100)).find((candidate) => candidate.id === actorId);
  if (actor === undefined) {
    return undefined;
  }
  const message = await sendInboxMessage(root, {
    receiverActorId: actor.id,
    senderActorId: "main",
    type: "user",
    content: text,
  });
  return { actor, messageId: message.id };
}

async function findActiveSteeringActor(root: string, sessionId: string | undefined): Promise<ActorRecord | undefined> {
  const actors = await listActors(root, 100);
  const running = actors.filter((actor) => actor.status === "running");
  const currentSessionMain = running.find((actor) => actor.role === "main" && actor.sessionId === sessionId);
  if (currentSessionMain !== undefined) {
    return currentSessionMain;
  }
  const anySessionMain = running.find((actor) => actor.role === "main");
  if (anySessionMain !== undefined) {
    return anySessionMain;
  }
  return running[0];
}
