export type SteeringQueueItem = {
  readonly id: number;
  readonly text: string;
};

export type SteeringInputState = {
  readonly queue: readonly SteeringQueueItem[];
  readonly steering: readonly string[];
  readonly nextId: number;
};

export type SteeringInputEffect =
  | { readonly kind: "queued"; readonly message: string }
  | { readonly kind: "steered"; readonly message: string }
  | { readonly kind: "listed"; readonly message: string }
  | { readonly kind: "updated"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "noop"; readonly message: string };

export type SteeringInputUpdate = {
  readonly state: SteeringInputState;
  readonly effect: SteeringInputEffect;
};

export function createSteeringInputState(): SteeringInputState {
  return { queue: [], steering: [], nextId: 1 };
}

export function applySteeringInput(state: SteeringInputState, rawText: string): SteeringInputUpdate {
  const text = rawText.trim();
  if (text.length === 0) {
    return { state, effect: { kind: "noop", message: "empty input ignored" } };
  }
  const parsed = parseCommandText(text);
  if (parsed === undefined) {
    return pushQueue(state, text);
  }
  if (parsed.name === "steer" || parsed.name === "s") {
    return pushSteering(state, parsed.rest);
  }
  if ((parsed.name === "queue" || parsed.name === "q") && parsed.rest.length === 0) {
    return { state, effect: { kind: "listed", message: formatQueue(state.queue) } };
  }
  if (parsed.name === "queue" || parsed.name === "q") {
    return applyQueueCommand(state, parsed.rest);
  }
  if (isBareQueueCommand(parsed.name)) {
    return applyQueueCommand(state, `${parsed.name}${parsed.rest.length === 0 ? "" : ` ${parsed.rest}`}`);
  }
  return pushQueue(state, text);
}

export function drainSteeringInput(state: SteeringInputState): SteeringInputUpdate {
  if (state.steering.length === 0) {
    return { state, effect: { kind: "noop", message: "no steering pending" } };
  }
  return {
    state: { ...state, steering: [] },
    effect: { kind: "steered", message: state.steering.join("\n") },
  };
}

function applyQueueCommand(state: SteeringInputState, command: string): SteeringInputUpdate {
  const parsed = parseCommandText(command);
  if (parsed === undefined) {
    return pushQueue(state, command);
  }
  if (parsed.name === "list") {
    return { state, effect: { kind: "listed", message: formatQueue(state.queue) } };
  }
  if (parsed.name === "clear") {
    return { state: { ...state, queue: [] }, effect: { kind: "updated", message: "queue cleared" } };
  }
  if (parsed.name === "rm") {
    return removeQueueItem(state, parsed.rest);
  }
  if (parsed.name === "edit") {
    return editQueueItem(state, parsed.rest);
  }
  if (parsed.name === "send") {
    return sendQueueItem(state, parsed.rest);
  }
  return pushQueue(state, command);
}

function pushQueue(state: SteeringInputState, text: string): SteeringInputUpdate {
  const item = { id: state.nextId, text };
  return {
    state: { ...state, queue: [...state.queue, item], nextId: state.nextId + 1 },
    effect: { kind: "queued", message: `queued ${item.id}` },
  };
}

function pushSteering(state: SteeringInputState, text: string): SteeringInputUpdate {
  if (text.trim().length === 0) {
    return { state, effect: { kind: "error", message: "steering text is empty" } };
  }
  return {
    state: { ...state, steering: [...state.steering, text.trim()] },
    effect: { kind: "steered", message: "steering queued for the next safe boundary" },
  };
}

function removeQueueItem(state: SteeringInputState, idText: string): SteeringInputUpdate {
  const id = parseQueueId(idText);
  if (id === undefined) {
    return { state, effect: { kind: "error", message: "usage: /queue rm <id>" } };
  }
  const nextQueue = state.queue.filter((item) => item.id !== id);
  if (nextQueue.length === state.queue.length) {
    return { state, effect: { kind: "error", message: `queue item ${id} not found` } };
  }
  return { state: { ...state, queue: nextQueue }, effect: { kind: "updated", message: `removed ${id}` } };
}

function editQueueItem(state: SteeringInputState, rest: string): SteeringInputUpdate {
  const parsed = parseIdAndText(rest);
  if (parsed === undefined) {
    return { state, effect: { kind: "error", message: "usage: /queue edit <id> <text>" } };
  }
  let found = false;
  const queue = state.queue.map((item) => {
    if (item.id !== parsed.id) {
      return item;
    }
    found = true;
    return { ...item, text: parsed.text };
  });
  return found
    ? { state: { ...state, queue }, effect: { kind: "updated", message: `edited ${parsed.id}` } }
    : { state, effect: { kind: "error", message: `queue item ${parsed.id} not found` } };
}

function sendQueueItem(state: SteeringInputState, idText: string): SteeringInputUpdate {
  if (idText.toLowerCase() === "all") {
    return {
      state: { ...state, queue: [], steering: [...state.steering, ...state.queue.map((item) => item.text)] },
      effect: { kind: "steered", message: "sent all queued items to steering" },
    };
  }
  const id = parseQueueId(idText);
  const item = id === undefined ? undefined : state.queue.find((candidate) => candidate.id === id);
  if (id === undefined || item === undefined) {
    return { state, effect: { kind: "error", message: "usage: /queue send <id|all>" } };
  }
  return {
    state: {
      ...state,
      queue: state.queue.filter((candidate) => candidate.id !== id),
      steering: [...state.steering, item.text],
    },
    effect: { kind: "steered", message: `sent ${id} to steering` },
  };
}

function formatQueue(queue: readonly SteeringQueueItem[]): string {
  if (queue.length === 0) {
    return "queue is empty";
  }
  return queue.map((item) => `${item.id}  ${item.text}`).join("\n");
}

function parseIdAndText(rest: string): { readonly id: number; readonly text: string } | undefined {
  const match = /^(\d+)\s+(.+)$/u.exec(rest);
  const id = match?.[1] === undefined ? undefined : parseQueueId(match[1]);
  const text = match?.[2]?.trim();
  return id === undefined || text === undefined || text.length === 0 ? undefined : { id, text };
}

function parseQueueId(text: string): number | undefined {
  if (!/^\d+$/u.test(text)) {
    return undefined;
  }
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function parseCommandText(text: string): { readonly name: string; readonly rest: string } | undefined {
  const normalized = text.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  const commandText = normalized.startsWith("/") ? normalized.slice(1).trim() : normalized;
  const match = /^(\S+)(?:\s+([\s\S]*))?$/u.exec(commandText);
  const name = match?.[1]?.toLowerCase();
  if (name === undefined) {
    return undefined;
  }
  return { name, rest: match?.[2]?.trim() ?? "" };
}

function isBareQueueCommand(name: string): boolean {
  return name === "list" || name === "rm" || name === "edit" || name === "send" || name === "clear";
}
