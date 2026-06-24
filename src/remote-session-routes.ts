import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

import { deleteSession } from "./session-delete.js";
import { readSession, renameSession } from "./session-store.js";
import { readJson, sendJson } from "./remote-http.js";

const renameSessionRequestSchema = z.object({
  name: z.string().min(1).max(180),
});

export async function handleSessionResource(
  root: string,
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const sessionId = decodeURIComponent(pathname.slice("/api/sessions/".length));
  if (sessionId.length === 0) {
    sendJson(response, 400, { error: "Session id is required." });
    return;
  }
  if (request.method === "DELETE") {
    const deleted = await deleteSession(root, sessionId);
    sendJson(response, deleted ? 200 : 404, deleted ? { ok: true } : { error: "Session not found." });
    return;
  }
  if (request.method === "PATCH") {
    const parsed = renameSessionRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      sendJson(response, 400, { error: "Session name is required." });
      return;
    }
    const renamed = await renameSession(root, sessionId, parsed.data.name);
    sendJson(response, renamed === undefined ? 404 : 200, renamed === undefined ? { error: "Session not found." } : { session: renamed });
    return;
  }
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }
  const session = await readSession(root, sessionId);
  sendJson(response, session === undefined ? 404 : 200, session === undefined ? { error: "Session not found." } : { session });
}
