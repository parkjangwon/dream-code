import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

import { listAgentRuns, readAgentRunRecord } from "./agent-run-store.js";
import { listSessions } from "./session-store.js";
import { appendRemoteAuditEvent, readRemoteAuditEvents } from "./remote-audit.js";
import type { DeviceRecord, RemoteAuth } from "./remote-auth.js";
import { clearRemoteAuthCookie, readJson, remoteAuthCookie, sendJson, sendSse } from "./remote-http.js";
import { appendRemoteLog } from "./remote-log.js";
import { handlePublicRemoteResource } from "./remote-pwa.js";
import { listRemoteProjects } from "./remote-projects.js";
import type { RemoteCommandBroker } from "./remote-command-broker.js";
import { handleRemoteCommand, handleRemoteCommandApproval, handleRemoteCommandCancel } from "./remote-server-command-routes.js";
import { handleRemoteModelResource } from "./remote-server-model-routes.js";
import { handleRemoteRunResource } from "./remote-server-run-routes.js";
import { authTokenFromRequest, hasCsrfHeader, isOperator, isStateChangingRequest, publicDevice, sameOriginOrNoOrigin } from "./remote-server-security.js";
import { handleSessionResource } from "./remote-session-routes.js";

const pairRequestSchema = z.object({
  code: z.string(),
  deviceName: z.string(),
  role: z.enum(["viewer", "operator"]).optional(),
});

export async function handleRemoteServerRequest(
  root: string,
  workspaceRoot: string,
  auth: RemoteAuth,
  broker: RemoteCommandBroker,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    response.once("finish", () => {
      void appendRemoteLog(root, `${request.method ?? "UNKNOWN"} ${url.pathname} ${response.statusCode}`);
    });
    if (handlePublicRemoteResource(url.pathname, request, response)) {
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/pair") {
      if (!sameOriginOrNoOrigin(request)) {
        sendJson(response, 403, { error: "CSRF check failed." });
        return;
      }
      await handlePair(root, auth, request, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/logout") {
      if (!sameOriginOrNoOrigin(request) || !hasCsrfHeader(request)) {
        sendJson(response, 403, { error: "CSRF check failed." });
        return;
      }
      sendJson(response, 200, { ok: true }, { "set-cookie": clearRemoteAuthCookie() });
      return;
    }
    const authToken = authTokenFromRequest(request);
    const device = await auth.authenticate(authToken.token);
    if (device === undefined) {
      await appendRemoteAuditEvent(root, { kind: "auth_denied", path: url.pathname, remoteAddress: request.socket.remoteAddress ?? "unknown", status: 401 });
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }
    if (authToken.source === "cookie" && isStateChangingRequest(request) && (!sameOriginOrNoOrigin(request) || !hasCsrfHeader(request))) {
      await appendRemoteAuditEvent(root, { kind: "auth_denied", path: url.pathname, remoteAddress: request.socket.remoteAddress ?? "unknown", status: 403, message: "csrf check failed" });
      sendJson(response, 403, { error: "CSRF check failed." });
      return;
    }
    if (url.pathname === "/api/me") {
      sendJson(response, 200, { device: publicDevice(device) });
      return;
    }
    await handleAuthed(root, workspaceRoot, broker, device, url.pathname, request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown remote server failure";
    sendJson(response, 500, { error: message });
  }
}

async function handlePair(root: string, auth: RemoteAuth, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const parsed = pairRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    await appendRemoteAuditEvent(root, { kind: "pair_malformed", path: "/api/pair", remoteAddress: request.socket.remoteAddress ?? "unknown", status: 400 });
    sendJson(response, 400, { error: "Pairing code and device name are required." });
    return;
  }
  const result = await auth.pairDevice({
    code: parsed.data.code,
    deviceName: parsed.data.deviceName,
    ...(parsed.data.role === undefined ? {} : { role: parsed.data.role }),
    remoteAddress: request.socket.remoteAddress ?? "unknown",
  });
  if (!result.ok) {
    await appendRemoteAuditEvent(root, { kind: "pair_denied", path: "/api/pair", remoteAddress: request.socket.remoteAddress ?? "unknown", status: result.status });
    sendJson(response, result.status, { error: result.message });
    return;
  }
  await appendRemoteAuditEvent(root, { kind: "pair_success", path: "/api/pair", remoteAddress: request.socket.remoteAddress ?? "unknown", deviceId: result.device.id, status: 200 });
  const body = shouldReturnTokenBody(request) ? { token: result.token, device: result.device } : { device: result.device };
  sendJson(response, 200, body, { "set-cookie": remoteAuthCookie(result.token) });
}

async function handleAuthed(
  root: string,
  workspaceRoot: string,
  broker: RemoteCommandBroker,
  device: DeviceRecord,
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  switch (pathname) {
    case "/api/projects":
      sendJson(response, 200, { projects: await listRemoteProjects(root, workspaceRoot) });
      return;
    case "/api/sessions":
      sendJson(response, 200, { sessions: await listSessions(root) });
      return;
    case "/api/runs":
      sendJson(response, 200, { runs: await listAgentRuns(root, 50) });
      return;
    case "/api/audit": {
      const records = await readRemoteAuditEvents(root);
      sendJson(response, 200, { records, events: records });
      return;
    }
    case "/api/model":
      if (request.method !== "GET" && !isOperator(device)) {
        await appendRemoteAuditEvent(root, { kind: "model_change_denied", path: pathname, deviceId: device.id, status: 403, message: "operator role required" });
        sendJson(response, 403, { error: "operator role required" });
        return;
      }
      await handleRemoteModelResource(root, request, response);
      return;
    case "/api/events":
      sendSse(request, response, broker);
      return;
    case "/api/commands":
      await handleCommandsPath(root, workspaceRoot, broker, device, request, response);
      return;
    default:
    await handleAuthedFallback(root, workspaceRoot, broker, device, pathname, request, response);
  }
}

async function handleCommandsPath(root: string, workspaceRoot: string, broker: RemoteCommandBroker, device: DeviceRecord, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "GET") {
    sendJson(response, 200, { commands: broker.commands() });
    return;
  }
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }
  if (!isOperator(device)) {
    await appendRemoteAuditEvent(root, { kind: "command_denied", path: "/api/commands", deviceId: device.id, status: 403, message: "operator role required" });
    sendJson(response, 403, { error: "operator role required" });
    return;
  }
  await handleRemoteCommand(root, broker, workspaceRoot, request, response);
}

async function handleAuthedFallback(root: string, workspaceRoot: string, broker: RemoteCommandBroker, device: DeviceRecord, pathname: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (pathname.startsWith("/api/commands/") && pathname.endsWith("/cancel")) {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    if (!isOperator(device)) {
      await appendRemoteAuditEvent(root, { kind: "command_cancel_denied", path: pathname, deviceId: device.id, status: 403, message: "operator role required" });
      sendJson(response, 403, { error: "operator role required" });
      return;
    }
    handleRemoteCommandCancel(broker, pathname, response);
    return;
  }
  if (pathname.startsWith("/api/commands/") && (pathname.endsWith("/approve") || pathname.endsWith("/reject"))) {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    if (!isOperator(device)) {
      await appendRemoteAuditEvent(root, { kind: "command_approval_denied", path: pathname, deviceId: device.id, status: 403, message: "operator role required" });
      sendJson(response, 403, { error: "operator role required" });
      return;
    }
    handleRemoteCommandApproval(broker, pathname, response);
    return;
  }
  if (pathname.startsWith("/api/runs/") && request.method !== "GET" && !isOperator(device)) {
    await appendRemoteAuditEvent(root, { kind: "run_action_denied", path: pathname, deviceId: device.id, status: 403, message: "operator role required" });
    sendJson(response, 403, { error: "operator role required" });
    return;
  }
  if (await handleRemoteRunResource(root, workspaceRoot, broker, pathname, request, response)) {
    return;
  }
  if (pathname.startsWith("/api/runs/")) {
    sendJson(response, 200, { run: await readAgentRunRecord(root, pathname.slice("/api/runs/".length)) });
    return;
  }
  if (pathname.startsWith("/api/sessions/")) {
    await handleSessionResource(root, pathname, request, response);
    return;
  }
  sendJson(response, 404, { error: "Not found" });
}

function shouldReturnTokenBody(request: IncomingMessage): boolean {
  return request.headers["x-dream-remote-token-response"] === "body";
}
