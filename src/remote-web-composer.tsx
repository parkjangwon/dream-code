import { h } from "preact";
import { useState } from "preact/hooks";

import { requestJson, type CommandRecord } from "./remote-web-api.js";
import type { RemoteScreen } from "./remote-web-screen.js";
import { requestRemoteNotificationPermission } from "./remote-web-notifications.js";
import { pendingUploadPayloads, pendingUploadsFromFiles, type PendingUpload, type PendingUploadPayload } from "./remote-web-upload.js";
import { remoteSlashCommands, type RemoteSlashCommand } from "./remote-slash-commands.js";

type CommandResponse = {
  readonly command: CommandRecord;
};

export function Composer(props: {
  readonly message: string;
  readonly screen: Extract<RemoteScreen, { readonly kind: "thread" }>;
  readonly onMessage: (message: string) => void;
  readonly onCommand: (command: CommandRecord) => void;
  readonly onError: (message: string) => void;
}) {
  const [uploads, setUploads] = useState<readonly PendingUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const prompt = props.message.trim();
  const canSubmit = !uploading && (prompt.length > 0 || uploads.length > 0);
  const commandMatches = slashCommandMatches(props.message);
  return (
    <form class={`composer ${uploads.length > 0 ? "has-attachments" : ""}`} onSubmit={(event) => {
      event.preventDefault();
      if (!canSubmit) {
        return;
      }
      requestRemoteNotificationPermission();
      setUploading(true);
      const basePrompt = prompt.length > 0 ? prompt : "Please review the uploaded files.";
      pendingUploadPayloads(uploads).then((uploadPayloads) => {
        return requestJson<CommandResponse>("POST", "/api/commands", commandBody(basePrompt, props.screen, uploadPayloads));
      }).then((result) => {
        setUploads([]);
        props.onMessage("");
        props.onCommand(result.command);
        props.onError("");
      }).catch((submitError: unknown) => {
        props.onError(submitError instanceof Error ? submitError.message : "Command failed.");
      }).finally(() => setUploading(false));
    }}>
      {commandMatches.length > 0 ? <CommandMenu matches={commandMatches} onSelect={(command) => props.onMessage(command.acceptsArgs ? `${command.name} ` : command.name)} /> : null}
      {uploads.length > 0 ? <AttachmentTray uploads={uploads} busy={uploading} onRemove={(id) => setUploads((current) => current.filter((upload) => upload.id !== id))} /> : null}
      <div class="composer-row">
        <label class="attach-button" aria-label="Attach files">
          <input class="file-input" type="file" multiple onChange={(event) => {
            const files = event.currentTarget.files;
            if (files !== null) {
              setUploads((current) => [...current, ...pendingUploadsFromFiles(files)].slice(0, 6));
            }
            event.currentTarget.value = "";
          }} />
        </label>
        <input class="input" value={props.message} onInput={(event) => props.onMessage(event.currentTarget.value)} placeholder={uploading ? "Uploading..." : "Ask Dream Code"} />
        <button class="send" type="submit" disabled={!canSubmit}>Send</button>
      </div>
    </form>
  );
}

function CommandMenu(props: {
  readonly matches: readonly RemoteSlashCommand[];
  readonly onSelect: (command: RemoteSlashCommand) => void;
}) {
  return (
    <div class="command-menu" role="listbox" aria-label="Slash commands">
      {props.matches.map((command) => (
        <button class="command-option" type="button" key={command.name} onClick={() => props.onSelect(command)}>
          <span>{command.name}</span>
          <small>{command.summary}</small>
        </button>
      ))}
    </div>
  );
}

function AttachmentTray(props: {
  readonly busy: boolean;
  readonly uploads: readonly PendingUpload[];
  readonly onRemove: (id: string) => void;
}) {
  return (
    <div class="attachment-tray" aria-label="Selected files">
      {props.uploads.map((upload) => (
        <span class="attachment-chip" key={upload.id}>
          <span>{upload.file.name}</span>
          <small>{formatBytes(upload.file.size)}</small>
          <button type="button" aria-label={`Remove ${upload.file.name}`} disabled={props.busy} onClick={() => props.onRemove(upload.id)}>×</button>
        </span>
      ))}
    </div>
  );
}

function commandBody(
  prompt: string,
  screen: Extract<RemoteScreen, { readonly kind: "thread" }>,
  uploads: readonly PendingUploadPayload[],
): { readonly prompt: string; readonly cwd?: string; readonly sessionId?: string; readonly uploads?: readonly PendingUploadPayload[] } {
  return {
    prompt,
    ...(screen.project === undefined ? {} : { cwd: screen.project.path }),
    ...(screen.session === undefined ? {} : { sessionId: screen.session.id }),
    ...(uploads.length === 0 ? {} : { uploads }),
  };
}

function slashCommandMatches(message: string): readonly RemoteSlashCommand[] {
  const trimmed = message.trimStart();
  if (!trimmed.startsWith("/") || /\s/u.test(trimmed)) {
    return [];
  }
  return remoteSlashCommands.filter((command) => command.name.startsWith(trimmed));
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
