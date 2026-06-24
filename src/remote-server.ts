import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { z } from "zod";

import { listAgentRuns, readAgentRunRecord } from "./agent-run-store.js";
import { listSessions } from "./session-store.js";
import { createRemoteAuth, type RemoteAuth } from "./remote-auth.js";
import { validateRemoteBind } from "./remote-cli.js";
import { bearerToken, readJson, sendJson, sendSse } from "./remote-http.js";
import { appendRemoteLog } from "./remote-log.js";
import { handlePublicRemoteResource } from "./remote-pwa.js";
import { listRemoteProjects } from "./remote-projects.js";
import { runRemoteCommand } from "./remote-command.js";
import { createRemoteCommandBroker, type RemoteCommandBroker, type RemoteCommandRunner } from "./remote-command-broker.js";
import { handleSessionResource } from "./remote-session-routes.js";
import { appendUploadedFiles, saveRemoteUploads } from "./remote-upload.js";

const pairRequestSchema = z.object({
  code: z.string(),
  deviceName: z.string(),
});

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

export type RemoteServerOptions = {
  readonly configRoot: string;
  readonly bindHost?: string;
  readonly port?: number;
  readonly pairingCode?: string;
  readonly unsafeAllowNonTailscale?: boolean;
  readonly commandRunner?: RemoteCommandRunner;
  readonly workspaceRoot?: string;
};

export type StartedRemoteServer = {
  readonly origin: string;
  readonly port: number;
  readonly pairingCode: string;
  readonly close: () => Promise<void>;
};

export async function startRemoteServer(options: RemoteServerOptions): Promise<StartedRemoteServer> {
  const bindHost = options.bindHost ?? "127.0.0.1";
  const port = options.port ?? 9999;
  const validation = validateRemoteBind(bindHost, options.unsafeAllowNonTailscale === true);
  if (!validation.ok) {
    throw new RemoteBindError(validation.message);
  }

  const auth = createRemoteAuth(options.configRoot, options.pairingCode);
  const broker = await createRemoteCommandBroker(options.configRoot, options.commandRunner ?? runRemoteCommand);
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const server = createServer((request, response) => {
    void handleRequest(options.configRoot, workspaceRoot, auth, broker, request, response);
  });
  const sockets = new Set<Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, bindHost, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!isAddressInfo(address)) {
    throw new RemoteBindError("Remote server did not bind to a TCP address.");
  }
  const origin = `http://${address.address}:${address.port}`;
  await appendRemoteLog(options.configRoot, `started origin=${origin}`);
  return {
    origin,
    port: address.port,
    pairingCode: auth.pairingCode,
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
      });
      await broker.flush();
    },
  };
}

export class RemoteBindError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteBindError";
  }
}

async function handleRequest(
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
      await handlePair(root, auth, request, response);
      return;
    }
    const token = url.pathname === "/api/events" ? (url.searchParams.get("token") ?? undefined) : bearerToken(request.headers["authorization"]);
    const device = await auth.authenticate(token);
    if (device === undefined) {
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }
    if (url.pathname === "/api/me") {
      sendJson(response, 200, { device: publicDevice(device) });
      return;
    }
    await handleAuthed(root, workspaceRoot, broker, url.pathname, request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown remote server failure";
    sendJson(response, 500, { error: message });
  }
}

async function handlePair(root: string, auth: RemoteAuth, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const parsed = pairRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    sendJson(response, 400, { error: "Pairing code and device name are required." });
    return;
  }
  const result = await auth.pairDevice({
    code: parsed.data.code,
    deviceName: parsed.data.deviceName,
    remoteAddress: request.socket.remoteAddress ?? "unknown",
  });
  if (!result.ok) {
    sendJson(response, result.status, { error: result.message });
    return;
  }
  sendJson(response, 200, { token: result.token, device: result.device });
}

async function handleAuthed(
  root: string,
  workspaceRoot: string,
  broker: RemoteCommandBroker,
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
    case "/api/events":
      sendSse(request, response, broker);
      return;
    case "/api/commands":
      if (request.method === "GET") {
        sendJson(response, 200, { commands: broker.commands() });
        return;
      }
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
      }
      await handleCommand(broker, workspaceRoot, request, response);
      return;
    default:
      if (pathname.startsWith("/api/commands/") && pathname.endsWith("/cancel")) {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "Method not allowed" });
          return;
        }
        handleCommandCancel(broker, pathname, response);
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
}

function handleCommandCancel(broker: RemoteCommandBroker, pathname: string, response: ServerResponse): void {
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

async function handleCommand(broker: RemoteCommandBroker, workspaceRoot: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
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
  sendJson(response, 202, { command });
}

function publicDevice(device: { readonly id: string; readonly name: string; readonly pairedAt: string; readonly lastSeenAt?: string | undefined }) {
  return {
    id: device.id,
    name: device.name,
    pairedAt: device.pairedAt,
    ...(device.lastSeenAt === undefined ? {} : { lastSeenAt: device.lastSeenAt }),
  };
}

function isAddressInfo(value: string | AddressInfo | null): value is AddressInfo {
  return typeof value === "object" && value !== null && "address" in value && "port" in value;
}
