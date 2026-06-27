export type ProjectDto = {
  readonly id: string;
  readonly name: string;
  readonly path: string;
};

export type SessionDto = {
  readonly id: string;
  readonly directory?: string;
  readonly name?: string;
  readonly summary?: string;
  readonly updatedAt?: string;
};

export type SessionTurnDto = {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly createdAt: string;
};

export type SessionDetailDto = SessionDto & {
  readonly directory: string;
  readonly turns: readonly SessionTurnDto[];
};

export type RunDto = {
  readonly id: string;
  readonly status: string;
  readonly prompt?: string;
  readonly changedFiles?: readonly string[];
  readonly checkpoints?: readonly { readonly path: string }[];
  readonly updatedAt?: string;
};

export type RunReviewDto = {
  readonly run: RunDto;
  readonly diff: string;
};

export type ModelProviderDto = {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly source: string;
  readonly models: readonly string[];
};

export type RemoteModelDto = {
  readonly mode: string;
  readonly single: {
    readonly provider: string;
    readonly defaultTier: "low" | "mid" | "high";
    readonly model: string;
    readonly models: {
      readonly low: string;
      readonly mid: string;
      readonly high: string;
    };
  };
  readonly providers: readonly ModelProviderDto[];
};

export type CommandStatus = "queued" | "running" | "waiting_approval" | "done" | "failed" | "cancelled";

export type CommandRecord = {
  readonly id: string;
  readonly prompt: string;
  readonly cwd: string;
  readonly status: CommandStatus;
  readonly output: string;
  readonly activity: readonly CommandActivity[];
  readonly sessionId?: string;
  readonly error?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly cancelRequestedAt?: string;
  readonly durationMs?: number;
  readonly pendingApproval?: {
    readonly tool: string;
    readonly label: string;
    readonly preview: string;
    readonly requestedAt: string;
  };
};

export type CommandActivity = {
  readonly at: string;
  readonly label: string;
  readonly detail?: string;
};

export type RemoteState = {
  readonly projects: readonly ProjectDto[];
  readonly sessions: readonly SessionDto[];
  readonly runs: readonly RunDto[];
  readonly model?: RemoteModelDto;
};

export type UploadedFileDto = {
  readonly name: string;
  readonly path: string;
  readonly mimeType?: string;
  readonly size: number;
};

export type PairResponse = {
  readonly device: DeviceDto;
};

export type DeviceDto = {
  readonly id: string;
  readonly name: string;
  readonly pairedAt: string;
};

type SnapshotEvent = {
  readonly type: "snapshot";
  readonly commands: readonly CommandRecord[];
};

type CommandEvent = {
  readonly type: "command";
  readonly command: CommandRecord;
};

type RemoteEvent = SnapshotEvent | CommandEvent;

export function requestJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, path);
    request.setRequestHeader("accept", "application/json");
    if (isStateChangingMethod(method)) {
      request.setRequestHeader("x-dream-remote-csrf", "1");
    }
    if (body !== undefined) {
      request.setRequestHeader("content-type", "application/json");
    }
    request.onload = () => {
      const data = request.responseText.length > 0 ? JSON.parse(request.responseText) : {};
      if (request.status >= 200 && request.status < 300) {
        resolve(data as T);
      } else {
        reject(new Error(typeof data.error === "string" ? data.error : `HTTP ${request.status}`));
      }
    };
    request.onerror = () => reject(new Error("Network error"));
    request.send(body === undefined ? undefined : JSON.stringify(body));
  });
}

function isStateChangingMethod(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD" && normalized !== "OPTIONS";
}

export function connectCommandEvents(
  onSnapshot: (commands: readonly CommandRecord[]) => void,
  onCommand: (command: CommandRecord) => void,
  onError: (message: string) => void,
): () => void {
  const events = new EventSource("/api/events");
  events.addEventListener("snapshot", (event) => {
    const parsed = parseRemoteEvent(event.data);
    if (parsed?.type === "snapshot") {
      onSnapshot(parsed.commands);
    }
  });
  events.addEventListener("command", (event) => {
    const parsed = parseRemoteEvent(event.data);
    if (parsed?.type === "command") {
      onCommand(parsed.command);
    }
  });
  events.onerror = () => onError("Remote event stream disconnected.");
  return () => events.close();
}

function parseRemoteEvent(raw: string): RemoteEvent | undefined {
  const parsed = JSON.parse(raw) as RemoteEvent;
  switch (parsed.type) {
    case "snapshot":
      return parsed;
    case "command":
      return parsed;
    default:
      return undefined;
  }
}
