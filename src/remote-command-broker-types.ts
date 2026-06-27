import type { RemoteCommandInput, RemoteCommandResult } from "./remote-command.js";
import type { RemoteUploadedFile } from "./remote-upload.js";

export type RemoteCommandStatus = "queued" | "running" | "waiting_approval" | "done" | "failed" | "cancelled";

export type RemoteCommandPendingApproval = {
  readonly id: string;
  readonly tool: string;
  readonly label: string;
  readonly preview: string;
  readonly requestedAt: string;
};

export type RemoteCommandRecord = {
  readonly id: string;
  readonly prompt: string;
  readonly runnerPrompt?: string;
  readonly cwd: string;
  readonly status: RemoteCommandStatus;
  readonly output: string;
  readonly activity: readonly RemoteCommandActivity[];
  readonly sessionId?: string;
  readonly error?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly cancelRequestedAt?: string;
  readonly durationMs?: number;
  readonly temporaryUploads?: readonly RemoteUploadedFile[];
  readonly pendingApproval?: RemoteCommandPendingApproval;
};

export type RemoteCommandActivity = {
  readonly at: string;
  readonly label: string;
  readonly detail?: string;
};

export type RemoteCommandEvent =
  | { readonly type: "snapshot"; readonly commands: readonly RemoteCommandRecord[] }
  | { readonly type: "command"; readonly command: RemoteCommandRecord };

export type RemoteCommandRunner = (input: RemoteCommandInput) => Promise<RemoteCommandResult>;

export type RemoteCommandSubmitInput = {
  readonly prompt: string;
  readonly cwd: string;
  readonly sessionId?: string;
  readonly runnerPrompt?: string;
  readonly temporaryUploads?: readonly RemoteUploadedFile[];
};

export type RemoteCommandBroker = {
  readonly submit: (input: RemoteCommandSubmitInput) => RemoteCommandRecord;
  readonly cancel: (id: string) => RemoteCommandRecord | undefined;
  readonly approve: (id: string) => RemoteCommandRecord | undefined;
  readonly reject: (id: string) => RemoteCommandRecord | undefined;
  readonly commands: () => readonly RemoteCommandRecord[];
  readonly subscribe: (listener: (event: RemoteCommandEvent) => void) => () => void;
  readonly flush: () => Promise<void>;
};
