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

export type RunningInputState = {
  readonly buffer: string;
  readonly cursor: number;
};

export type RunningInputEffect =
  | { readonly kind: "none" }
  | { readonly kind: "render" }
  | { readonly kind: "submit"; readonly command: RunningCommand };

export type RunningInputKey = {
  readonly name?: string | undefined;
  readonly ctrl?: boolean | undefined;
  readonly meta?: boolean | undefined;
};

export type RunningInputUpdate = {
  readonly state: RunningInputState;
  readonly effect: RunningInputEffect;
};

export type SteeringTarget = {
  readonly actor: ActorRecord;
  readonly messageId: string;
};

const slashCommandPattern = /^\/([^\s]+)(?:\s+([\s\S]*))?$/u;

export function initialRunningInputState(): RunningInputState {
  return { buffer: "", cursor: 0 };
}

export function reduceRunningInputState(
  state: RunningInputState,
  value: string | undefined,
  key: RunningInputKey,
): RunningInputUpdate {
  if (key.name === "return" || key.name === "enter") {
    return {
      state: initialRunningInputState(),
      effect: { kind: "submit", command: parseRunningCommand(state.buffer) },
    };
  }
  if (key.ctrl === true && key.name === "u") {
    return {
      state: { buffer: state.buffer.slice(state.cursor), cursor: 0 },
      effect: { kind: "render" },
    };
  }
  if (key.ctrl === true && key.name === "k") {
    return {
      state: { buffer: state.buffer.slice(0, state.cursor), cursor: state.cursor },
      effect: { kind: "render" },
    };
  }
  if (key.ctrl === true && key.name === "a") {
    return { state: { ...state, cursor: 0 }, effect: { kind: "render" } };
  }
  if (key.ctrl === true && key.name === "e") {
    return { state: { ...state, cursor: state.buffer.length }, effect: { kind: "render" } };
  }
  if (key.name === "backspace") {
    if (state.cursor === 0) {
      return { state, effect: { kind: "none" } };
    }
    return {
      state: {
        buffer: `${state.buffer.slice(0, state.cursor - 1)}${state.buffer.slice(state.cursor)}`,
        cursor: state.cursor - 1,
      },
      effect: { kind: "render" },
    };
  }
  if (key.name === "delete") {
    if (state.cursor >= state.buffer.length) {
      return { state, effect: { kind: "none" } };
    }
    return {
      state: {
        buffer: `${state.buffer.slice(0, state.cursor)}${state.buffer.slice(state.cursor + 1)}`,
        cursor: state.cursor,
      },
      effect: { kind: "render" },
    };
  }
  if (key.name === "left") {
    return { state: { ...state, cursor: Math.max(0, state.cursor - 1) }, effect: { kind: "render" } };
  }
  if (key.name === "right") {
    return { state: { ...state, cursor: Math.min(state.buffer.length, state.cursor + 1) }, effect: { kind: "render" } };
  }
  if (key.name === "home") {
    return { state: { ...state, cursor: 0 }, effect: { kind: "render" } };
  }
  if (key.name === "end") {
    return { state: { ...state, cursor: state.buffer.length }, effect: { kind: "render" } };
  }
  if (key.ctrl === true || key.meta === true || value === undefined || value.length === 0) {
    return { state, effect: { kind: "none" } };
  }

  const nextBuffer = `${state.buffer.slice(0, state.cursor)}${value}${state.buffer.slice(state.cursor)}`;
  return {
    state: { buffer: nextBuffer, cursor: state.cursor + value.length },
    effect: { kind: "render" },
  };
}

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
