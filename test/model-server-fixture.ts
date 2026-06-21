import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export type ModelListServer = {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
};

export function startModelListServer(models: readonly string[]): Promise<ModelListServer> {
  const server = createServer((request, response) => {
    if (request.url === "/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: models.map((id) => ({ id })) }));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!isAddressInfo(address)) {
        reject(new Error("Model list server did not expose a TCP port."));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => {
            if (error !== undefined) {
              closeReject(error);
              return;
            }
            closeResolve();
          });
        }),
      });
    });
  });
}

function isAddressInfo(value: string | AddressInfo | null): value is AddressInfo {
  return typeof value === "object" && value !== null && "port" in value;
}
