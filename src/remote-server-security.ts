import type { IncomingMessage } from "node:http";

import type { DeviceRecord } from "./remote-auth.js";
import { bearerToken, cookieToken } from "./remote-http.js";

export type RemoteAuthToken =
  | { readonly source: "bearer"; readonly token: string }
  | { readonly source: "cookie"; readonly token: string }
  | { readonly source: "none"; readonly token: undefined };

export function publicDevice(device: { readonly id: string; readonly name: string; readonly role?: string; readonly pairedAt: string; readonly lastSeenAt?: string | undefined }) {
  return {
    id: device.id,
    name: device.name,
    role: device.role ?? "operator",
    pairedAt: device.pairedAt,
    ...(device.lastSeenAt === undefined ? {} : { lastSeenAt: device.lastSeenAt }),
  };
}

export function isOperator(device: DeviceRecord): boolean {
  return device.role === "operator";
}

export function authTokenFromRequest(request: IncomingMessage): RemoteAuthToken {
  const bearer = bearerToken(request.headers["authorization"]);
  if (bearer !== undefined) {
    return { source: "bearer", token: bearer };
  }
  const cookie = cookieToken(request.headers.cookie);
  if (cookie !== undefined) {
    return { source: "cookie", token: cookie };
  }
  return { source: "none", token: undefined };
}

export function isStateChangingRequest(request: IncomingMessage): boolean {
  return request.method !== undefined && request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS";
}

export function hasCsrfHeader(request: IncomingMessage): boolean {
  return request.headers["x-dream-remote-csrf"] === "1";
}

export function sameOriginOrNoOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (origin === undefined || host === undefined) {
    return true;
  }
  const value = Array.isArray(origin) ? origin[0] : origin;
  if (value === undefined) {
    return false;
  }
  try {
    return new URL(value).host === host;
  } catch (error) {
    if (error instanceof Error) {
      return false;
    }
    throw error;
  }
}
