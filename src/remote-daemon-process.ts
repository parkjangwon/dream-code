import { execFile } from "node:child_process";

export type ProcessListRunner = (command: string, args: readonly string[]) => Promise<{ readonly stdout: string }>;

export async function findRemoteDaemonPids(
  port: number,
  runCommand: ProcessListRunner = execFileOutput,
): Promise<readonly number[]> {
  const result = await runCommand("ps", ["-axo", "pid=,command="]);
  return result.stdout
    .split(/\r?\n/u)
    .flatMap((line) => remoteDaemonPidFromLine(line, port))
    .filter((pid) => pid !== process.pid);
}

export async function terminateRemoteDaemonPids(pids: readonly number[], timeoutMs = 2_000): Promise<void> {
  const uniquePids = [...new Set(pids)].filter(isProcessAlive);
  for (const pid of uniquePids) {
    killProcess(pid, "SIGTERM");
  }
  if (await waitForExit(uniquePids, timeoutMs)) {
    return;
  }
  for (const pid of uniquePids.filter(isProcessAlive)) {
    killProcess(pid, "SIGKILL");
  }
  await waitForExit(uniquePids, timeoutMs);
}

export function remoteDaemonPidFromLine(line: string, port: number): readonly number[] {
  const match = /^\s*(\d+)\s+(.+)$/u.exec(line);
  if (match === null) {
    return [];
  }
  const pid = Number.parseInt(match[1] ?? "", 10);
  const command = match[2] ?? "";
  if (!Number.isInteger(pid) || !isRemoteDaemonCommand(command, port)) {
    return [];
  }
  return [pid];
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isErrno(error, "EPERM")) {
      return true;
    }
    if (isErrno(error, "ESRCH")) {
      return false;
    }
    return false;
  }
}

function isRemoteDaemonCommand(command: string, port: number): boolean {
  const pattern = new RegExp(
    `(?:^|\\s)(?:\\S*/)?node\\s+(?:\\S*/)?(?:dist/src/)?cli\\.js\\s+remote\\s+daemon\\s+--port\\s+${port}(?:\\s|$)`,
    "u",
  );
  return pattern.test(command);
}

function killProcess(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (isErrno(error, "ESRCH")) {
      return;
    }
    throw error;
  }
}

async function waitForExit(pids: readonly number[], timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (pids.every((pid) => !isProcessAlive(pid))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return pids.every((pid) => !isProcessAlive(pid));
}

function execFileOutput(command: string, args: readonly string[]): Promise<{ readonly stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], { timeout: 5_000 }, (error, stdout) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve({ stdout });
    });
  });
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrno(error: unknown, code: string): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string" && error.code === code;
}
