import { execFile } from "node:child_process";
import { z } from "zod";

const tailscaleStatusSchema = z.object({
  BackendState: z.string().min(1),
  Self: z.object({
    DNSName: z.string().optional(),
  }).optional(),
});

export type TailscaleStatus =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly message: string };

export type TailscaleCommandRunner = (command: string, args: readonly string[]) => Promise<{ readonly stdout: string }>;

export type TailscaleServeOptions = {
  readonly port: number;
  readonly origin: string;
  readonly runCommand?: TailscaleCommandRunner;
};

export type TailscaleServeScheme = "http" | "https";

export async function checkTailscaleRunning(runCommand: TailscaleCommandRunner = execFileOutput): Promise<TailscaleStatus> {
  try {
    const result = await runCommand("tailscale", ["status", "--json"]);
    const parsed = parseTailscaleStatus(result.stdout);
    return parsed.BackendState === "Running"
      ? { ok: true, message: "Tailscale is running." }
      : { ok: false, message: `Tailscale is ${parsed.BackendState}. Start Tailscale before running Dream Remote.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Tailscale failure";
    return { ok: false, message: `Tailscale is required for Dream Remote: ${message}` };
  }
}

export function parseTailscaleStatus(raw: string): { readonly BackendState: string } {
  return tailscaleStatusSchema.parse(JSON.parse(raw));
}

export async function startTailscaleServe(options: TailscaleServeOptions): Promise<TailscaleServeScheme> {
  const runCommand = options.runCommand ?? execFileOutput;
  try {
    await runCommand("tailscale", ["serve", "--bg", `--https=${options.port}`, options.origin]);
    return "https";
  } catch {
    await runCommand("tailscale", ["serve", "--bg", `--http=${options.port}`, options.origin]);
    return "http";
  }
}

export async function stopTailscaleServe(port: number, runCommand: TailscaleCommandRunner = execFileOutput): Promise<void> {
  await stopServeHandler(port, "https", runCommand);
  await stopServeHandler(port, "http", runCommand);
}

async function stopServeHandler(port: number, scheme: "http" | "https", runCommand: TailscaleCommandRunner): Promise<void> {
  try {
    await runCommand("tailscale", ["serve", `--${scheme}=${port}`, "off"]);
  } catch (error) {
    if (isMissingServeHandler(error)) {
      return;
    }
    if (isServeConfigRace(error)) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await stopServeHandler(port, scheme, runCommand);
      return;
    }
    throw error;
  }
}

export async function remoteTailscaleUrl(
  port: number,
  scheme: TailscaleServeScheme = "https",
  runCommand: TailscaleCommandRunner = execFileOutput,
): Promise<string> {
  const result = await runCommand("tailscale", ["status", "--json"]);
  const parsed = tailscaleStatusSchema.parse(JSON.parse(result.stdout));
  const dnsName = parsed.Self?.DNSName?.replace(/\.$/u, "");
  return dnsName === undefined || dnsName.length === 0 ? `http://127.0.0.1:${port}` : `${scheme}://${dnsName}:${port}`;
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

function isMissingServeHandler(error: unknown): boolean {
  return error instanceof Error && /handler does not exist|failed to remove web serve/u.test(error.message);
}

function isServeConfigRace(error: unknown): boolean {
  return error instanceof Error && /etag mismatch|Another client is changing the serve config/u.test(error.message);
}
