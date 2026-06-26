import { open, rm, stat } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const lockStaleMs = 30_000;

export async function withRemoteDeviceStoreLock<T>(lockPath: string, operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const lock = await tryAcquireLock(lockPath);
    if (lock !== undefined) {
      try {
        return await operation();
      } finally {
        await lock.close();
        await rm(lockPath, { force: true });
      }
    }
    await removeStaleLock(lockPath);
    await delay(Math.min(5 + attempt, 50));
  }
  throw new Error("Timed out waiting for remote device store lock.");
}

async function tryAcquireLock(lockPath: string) {
  try {
    return await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (isErrnoException(error) && error.code === "EEXIST") {
      return undefined;
    }
    throw error;
  }
}

async function removeStaleLock(lockPath: string): Promise<void> {
  try {
    const lockStat = await stat(lockPath);
    if (Date.now() - lockStat.mtimeMs > lockStaleMs) {
      await rm(lockPath, { force: true });
    }
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
