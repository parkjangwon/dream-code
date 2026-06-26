import { createHash, randomBytes, randomInt } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { withRemoteDeviceStoreLock } from "./remote-device-store-lock.js";

const deviceRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(["viewer", "operator"]).default("operator"),
  tokenHash: z.string().min(1),
  pairedAt: z.string().min(1),
  expiresAt: z.string().min(1).optional(),
  lastSeenAt: z.string().min(1).optional(),
});

const deviceStoreSchema = z.object({
  version: z.literal(1),
  devices: z.array(deviceRecordSchema),
});

const defaultTokenTtlMs = 90 * 24 * 60 * 60 * 1000;
const lastSeenRefreshMs = 60_000;
const deviceStoreUpdates = new Map<string, Promise<void>>();

export type DeviceRecord = z.infer<typeof deviceRecordSchema>;
type DeviceStore = z.infer<typeof deviceStoreSchema>;

export type PairDeviceInput = {
  readonly code: string;
  readonly deviceName: string;
  readonly role?: "viewer" | "operator";
  readonly remoteAddress: string;
};

export type PairDeviceResult =
  | { readonly ok: true; readonly token: string; readonly device: Omit<DeviceRecord, "tokenHash"> }
  | { readonly ok: false; readonly status: 400 | 401 | 429; readonly message: string };

export type RemoteAuth = {
  readonly pairingCode: string;
  readonly pairDevice: (input: PairDeviceInput) => Promise<PairDeviceResult>;
  readonly authenticate: (token: string | undefined) => Promise<DeviceRecord | undefined>;
};

export type RemoteAuthOptions = {
  readonly tokenTtlMs?: number;
};

type RateLimitBucket = {
  readonly attempts: readonly number[];
};

export function createRemoteAuth(root: string, pairingCode = generatePairingCode(), options: RemoteAuthOptions = {}): RemoteAuth {
  const rateLimits = new Map<string, RateLimitBucket>();
  return {
    pairingCode,
    pairDevice: async (input) => pairDevice(root, pairingCode, rateLimits, input, options),
    authenticate: async (token) => authenticate(root, token),
  };
}

export function remoteDevicesPath(root: string): string {
  return join(root, "remote", "devices.json");
}

export async function listRemoteDevices(root: string): Promise<readonly Omit<DeviceRecord, "tokenHash">[]> {
  const store = await readDeviceStore(root);
  return store.devices.map(publicDevice);
}

export async function revokeRemoteDevice(root: string, deviceId: string): Promise<boolean> {
  return await updateDeviceStore(root, (store) => {
    const nextDevices = store.devices.filter((device) => device.id !== deviceId);
    if (nextDevices.length === store.devices.length) {
      return { store, value: false };
    }
    return { store: { version: 1, devices: nextDevices }, value: true };
  });
}

async function pairDevice(
  root: string,
  pairingCode: string,
  rateLimits: Map<string, RateLimitBucket>,
  input: PairDeviceInput,
  options: RemoteAuthOptions,
): Promise<PairDeviceResult> {
  const deviceName = input.deviceName.trim();
  if (!/^\d{6}$/u.test(input.code) || deviceName.length === 0) {
    return { ok: false, status: 400, message: "Pairing code and device name are required." };
  }
  if (isPairingRateLimited(rateLimits, input.remoteAddress)) {
    return { ok: false, status: 429, message: "Too many pairing attempts. Try again later." };
  }
  if (input.code !== pairingCode) {
    return { ok: false, status: 401, message: "Invalid pairing code." };
  }

  const token = randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const device: DeviceRecord = {
    id: `dev_${randomBytes(8).toString("hex")}`,
    name: deviceName,
    role: input.role ?? "operator",
    tokenHash: hashToken(token),
    pairedAt: now,
    expiresAt: new Date(Date.now() + (options.tokenTtlMs ?? defaultTokenTtlMs)).toISOString(),
  };
  await updateDeviceStore(root, (store) => ({
    store: { version: 1, devices: [...store.devices, device] },
    value: undefined,
  }));
  return { ok: true, token, device: publicDevice(device) };
}

async function authenticate(root: string, token: string | undefined): Promise<DeviceRecord | undefined> {
  if (token === undefined || token.trim().length === 0) {
    return undefined;
  }
  const tokenHash = hashToken(token);
  const store = await readDeviceStore(root);
  const device = store.devices.find((entry) => entry.tokenHash === tokenHash && !isExpired(entry));
  if (device === undefined) {
    return undefined;
  }
  if (!shouldRefreshLastSeen(device)) {
    return device;
  }
  return await updateDeviceStore(root, (current) => {
    const currentDevice = current.devices.find((entry) => entry.tokenHash === tokenHash && !isExpired(entry));
    if (currentDevice === undefined) {
      return { store: current, value: undefined };
    }
    if (!shouldRefreshLastSeen(currentDevice)) {
      return { store: current, value: currentDevice };
    }
    const seenDevice = { ...currentDevice, lastSeenAt: new Date().toISOString() };
    return {
      store: {
        version: 1,
        devices: current.devices.map((entry) => entry.id === seenDevice.id ? seenDevice : entry),
      },
      value: seenDevice,
    };
  });
}

type DeviceStoreUpdate<T> = {
  readonly store: DeviceStore;
  readonly value: T;
};

async function updateDeviceStore<T>(root: string, update: (store: DeviceStore) => DeviceStoreUpdate<T>): Promise<T> {
  const previous = deviceStoreUpdates.get(root) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(async () => {
    await mkdir(join(root, "remote"), { recursive: true, mode: 0o700 });
    return await withRemoteDeviceStoreLock(`${remoteDevicesPath(root)}.lock`, async () => {
      const result = update(await readDeviceStore(root));
      await writeDeviceStore(root, result.store);
      return result.value;
    });
  });
  const marker = queued.then(() => undefined, () => undefined);
  deviceStoreUpdates.set(root, marker);
  marker.finally(() => {
    if (deviceStoreUpdates.get(root) === marker) {
      deviceStoreUpdates.delete(root);
    }
  });
  return await queued;
}

async function readDeviceStore(root: string): Promise<DeviceStore> {
  try {
    return deviceStoreSchema.parse(JSON.parse(await readFile(remoteDevicesPath(root), "utf8")));
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return { version: 1, devices: [] };
    }
    throw error;
  }
}

async function writeDeviceStore(root: string, store: DeviceStore): Promise<void> {
  await mkdir(join(root, "remote"), { recursive: true, mode: 0o700 });
  const path = remoteDevicesPath(root);
  const temporaryPath = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const file = await open(temporaryPath, "w", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(store, undefined, 2)}\n`, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function publicDevice(device: DeviceRecord): Omit<DeviceRecord, "tokenHash"> {
  return {
    id: device.id,
    name: device.name,
    role: device.role,
    pairedAt: device.pairedAt,
    ...(device.expiresAt === undefined ? {} : { expiresAt: device.expiresAt }),
    ...(device.lastSeenAt === undefined ? {} : { lastSeenAt: device.lastSeenAt }),
  };
}

function isExpired(device: DeviceRecord): boolean {
  return device.expiresAt !== undefined && Date.parse(device.expiresAt) <= Date.now();
}

function shouldRefreshLastSeen(device: DeviceRecord): boolean {
  return device.lastSeenAt === undefined || Date.parse(device.lastSeenAt) <= Date.now() - lastSeenRefreshMs;
}

function isPairingRateLimited(rateLimits: Map<string, RateLimitBucket>, remoteAddress: string): boolean {
  const now = Date.now();
  const windowStart = now - 5 * 60 * 1000;
  const previous = rateLimits.get(remoteAddress)?.attempts.filter((attempt) => attempt >= windowStart) ?? [];
  const attempts = [...previous, now];
  rateLimits.set(remoteAddress, { attempts });
  return attempts.length > 5;
}

function generatePairingCode(): string {
  return randomInt(100_000, 1_000_000).toString();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
