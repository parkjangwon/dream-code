import { createServer } from "node:http";
import type { AddressInfo, Socket } from "node:net";

import { createRemoteAuth } from "./remote-auth.js";
import { validateRemoteBind } from "./remote-cli.js";
import { appendRemoteLog } from "./remote-log.js";
import { runRemoteCommand } from "./remote-command.js";
import { createRemoteCommandBroker, type RemoteCommandRunner } from "./remote-command-broker.js";
import { handleRemoteServerRequest } from "./remote-server-request.js";

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
    void handleRemoteServerRequest(options.configRoot, workspaceRoot, auth, broker, request, response);
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

function isAddressInfo(value: string | AddressInfo | null): value is AddressInfo {
  return typeof value === "object" && value !== null && "address" in value && "port" in value;
}
