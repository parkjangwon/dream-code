import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";

import { appendRemoteAuditEvent } from "./remote-audit.js";
import type { RemoteCommandBroker } from "./remote-command-broker.js";
import { sendJson, readJson } from "./remote-http.js";
import { listRemoteProjects } from "./remote-projects.js";
import { appendUploadedFiles, saveRemoteUploads } from "./remote-upload.js";
import { readSession } from "./session-store.js";

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
  const cwdResult = await resolveRemoteCommandCwd(root, workspaceRoot, parsed.data.cwd, parsed.data.sessionId);
  if (!cwdResult.ok) {
    sendJson(response, 400, { error: cwdResult.message });
    return;
  }
  const cwd = cwdResult.cwd;
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

type RemoteCommandCwdResult =
  | { readonly ok: true; readonly cwd: string }
  | { readonly ok: false; readonly message: string };

async function resolveRemoteCommandCwd(root: string, workspaceRoot: string, requestedCwd: string | undefined, sessionId: string | undefined): Promise<RemoteCommandCwdResult> {
  const cwd = resolve(requestedCwd ?? workspaceRoot);
  const projects = await listRemoteProjects(root, workspaceRoot);
  const allowed = projects.some((project) => containsPath(project.path, cwd));
  if (!allowed) {
    return { ok: false, message: "Command cwd must be inside a known remote project." };
  }
  if (sessionId !== undefined) {
    const session = await readSession(root, sessionId);
    if (session !== undefined && !containsPath(session.directory, cwd)) {
      return { ok: false, message: "Command cwd must stay inside the selected session directory." };
    }
  }
  return { ok: true, cwd };
}

function containsPath(parent: string, child: string): boolean {
  const parentPath = resolve(parent);
  const childPath = resolve(child);
  const pathToChild = relative(parentPath, childPath);
  return pathToChild.length === 0 || (!pathToChild.startsWith("..") && !isAbsolute(pathToChild));
}
