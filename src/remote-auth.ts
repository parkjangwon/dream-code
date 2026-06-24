import { createHash, randomBytes, randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const deviceRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tokenHash: z.string().min(1),
  pairedAt: z.string().min(1),
  lastSeenAt: z.string().min(1).optional(),
});

const deviceStoreSchema = z.object({
  version: z.literal(1),
  devices: z.array(deviceRecordSchema),
});

type DeviceRecord = z.infer<typeof deviceRecordSchema>;
type DeviceStore = z.infer<typeof deviceStoreSchema>;

export type PairDeviceInput = {
  readonly code: string;
  readonly deviceName: string;
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

type RateLimitBucket = {
  readonly attempts: readonly number[];
};

export function createRemoteAuth(root: string, pairingCode = generatePairingCode()): RemoteAuth {
  const rateLimits = new Map<string, RateLimitBucket>();
  return {
    pairingCode,
    pairDevice: async (input) => pairDevice(root, pairingCode, rateLimits, input),
    authenticate: async (token) => authenticate(root, token),
  };
}

export function remoteDevicesPath(root: string): string {
  return join(root, "remote", "devices.json");
}

async function pairDevice(
  root: string,
  pairingCode: string,
  rateLimits: Map<string, RateLimitBucket>,
  input: PairDeviceInput,
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
    tokenHash: hashToken(token),
    pairedAt: now,
  };
  const store = await readDeviceStore(root);
  await writeDeviceStore(root, { version: 1, devices: [...store.devices, device] });
  return { ok: true, token, device: publicDevice(device) };
}

async function authenticate(root: string, token: string | undefined): Promise<DeviceRecord | undefined> {
  if (token === undefined || token.trim().length === 0) {
    return undefined;
  }
  const tokenHash = hashToken(token);
  const store = await readDeviceStore(root);
  return store.devices.find((device) => device.tokenHash === tokenHash);
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
  await writeFile(remoteDevicesPath(root), `${JSON.stringify(store, undefined, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function publicDevice(device: DeviceRecord): Omit<DeviceRecord, "tokenHash"> {
  return {
    id: device.id,
    name: device.name,
    pairedAt: device.pairedAt,
    ...(device.lastSeenAt === undefined ? {} : { lastSeenAt: device.lastSeenAt }),
  };
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
