import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

export type RemoteLogOptions = {
  readonly now?: Date;
  readonly maxBytes?: number;
  readonly maxArchives?: number;
};

const defaultMaxBytes = 5 * 1024 * 1024;
const defaultMaxArchives = 7;

export function remoteLogPath(root: string): string {
  return join(root, "webapp", "remote.log");
}

export async function appendRemoteLog(root: string, message: string, options: RemoteLogOptions = {}): Promise<void> {
  const now = options.now ?? new Date();
  const logPath = remoteLogPath(root);
  await mkdir(join(root, "webapp"), { recursive: true, mode: 0o700 });
  await rotateIfNeeded(root, logPath, options.maxBytes ?? defaultMaxBytes, now, options.maxArchives ?? defaultMaxArchives);
  await import("node:fs/promises").then(({ appendFile }) => appendFile(logPath, `${now.toISOString()} ${message}\n`, "utf8"));
}

async function rotateIfNeeded(root: string, logPath: string, maxBytes: number, now: Date, maxArchives: number): Promise<void> {
  const size = await currentSize(logPath);
  if (size < maxBytes) {
    return;
  }
  const archivePath = join(root, "webapp", `remote-${timestamp(now)}.log`);
  await rename(logPath, archivePath);
  await pipeline(createReadStream(archivePath), createGzip(), createWriteStream(`${archivePath}.gz`));
  await rm(archivePath, { force: true });
  await pruneArchives(root, maxArchives);
}

async function pruneArchives(root: string, maxArchives: number): Promise<void> {
  const webappRoot = join(root, "webapp");
  const archives = (await readdir(webappRoot))
    .filter((entry) => /^remote-.+\.log\.gz$/u.test(entry))
    .sort((left, right) => right.localeCompare(left));
  await Promise.all(archives.slice(maxArchives).map((archive) => rm(join(webappRoot, archive), { force: true })));
}

async function currentSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

function timestamp(now: Date): string {
  return now.toISOString().replace(/[:.]/gu, "-");
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
