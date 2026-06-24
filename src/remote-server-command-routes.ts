import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

import { appendRemoteAuditEvent } from "./remote-audit.js";
import type { RemoteCommandBroker } from "./remote-command-broker.js";
import { sendJson, readJson } from "./remote-http.js";
import { appendUploadedFiles, saveRemoteUploads } from "./remote-upload.js";

const commandRequestSchema = z.object({
  prompt: z.string().min(1),
  cwd: z.string().optional(),
  sessionId: z.string().optional(),
  uploads: z.array(z.object({
    dataBase64: z.string().min(1).max(14_000_000),
    name: z.string().min(1).max(240),
    type: z.string().max(200).optional(),
  })).max(6).optional(),
});

export function handleRemoteCommandCancel(
  broker: RemoteCommandBroker,
  pathname: string,
  response: ServerResponse,
): void {
  const id = pathname.slice("/api/commands/".length, -"/cancel".length);
  if (id.length === 0) {
    sendJson(response, 400, { error: "Command id is required." });
    return;
  }
  const command = broker.cancel(decodeURIComponent(id));
  if (command === undefined) {
    sendJson(response, 404, { error: "Command not found." });
    return;
  }
  sendJson(response, 200, { command });
}

export async function handleRemoteCommand(
  root: string,
  broker: RemoteCommandBroker,
  workspaceRoot: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const parsed = commandRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    sendJson(response, 400, { error: "Prompt is required." });
    return;
  }
  const cwd = parsed.data.cwd ?? workspaceRoot;
  const temporaryUploads = parsed.data.uploads === undefined ? [] : await saveRemoteUploads(cwd, parsed.data.uploads);
  const command = broker.submit({
    prompt: parsed.data.prompt,
    cwd,
    ...(parsed.data.sessionId === undefined ? {} : { sessionId: parsed.data.sessionId }),
    ...(temporaryUploads.length === 0 ? {} : {
      runnerPrompt: appendUploadedFiles(parsed.data.prompt, temporaryUploads),
      temporaryUploads,
    }),
  });
  await appendRemoteAuditEvent(root, {
    kind: "command_submitted",
    action: "command.submitted",
    method: "POST",
    path: "/api/commands",
    commandId: command.id,
    status: command.status,
  });
  sendJson(response, 202, { command });
}
