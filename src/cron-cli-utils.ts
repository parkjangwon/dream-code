import type { CronJob } from "./cron-types.js";

export type ParsedOption = {
  readonly args: readonly string[];
  readonly flags: ReadonlyMap<string, string>;
};

export const defaultDaemonIntervalMs = 60_000;

export function parseOptions(args: readonly string[]): ParsedOption {
  const values: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg?.startsWith("--") === true) {
      const key = arg.slice(2);
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(key, next);
        index += 1;
      } else {
        flags.set(key, "true");
      }
      continue;
    }
    if (arg !== undefined) {
      values.push(arg);
    }
  }
  return { args: values, flags };
}

export function parseDaemonInterval(args: readonly string[]): number {
  const raw = parseOptions(args).flags.get("interval");
  if (raw === undefined) {
    return defaultDaemonIntervalMs;
  }
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) ? Math.max(5_000, seconds * 1_000) : defaultDaemonIntervalMs;
}

export function parseMode(raw: string): "agent" | "workflow" | "swarm" {
  const normalized = raw.trim();
  if (normalized === "workflow" || normalized.startsWith("/workflow")) {
    return "workflow";
  }
  if (normalized === "swarm" || normalized.startsWith("/swarm")) {
    return "swarm";
  }
  return "agent";
}

export function parsePermissionMode(raw: string | undefined): "ask" | "auto" | "yolo" {
  return raw === "auto" || raw === "yolo" ? raw : "ask";
}

export function draftName(prompt: string): string {
  const words = prompt.trim().replace(/\s+/gu, " ").split(" ").slice(0, 5).join(" ");
  return words.length === 0 ? "Dream cron" : words;
}

export function formatJobLine(job: CronJob): string {
  return `  ${job.enabled ? "[v]" : "[ ]"} ${job.name} ${job.schedule} next ${job.nextRunAt ?? "paused"} · ${job.mode}`;
}

export function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function printCronUsage(): void {
  console.log([
    "Usage:",
    "  dream cron list",
    "  dream cron add \"every day at 09:00 run tests\"",
    "  dream cron add --name nightly --mode swarm \"0 2 * * * /swarm --size 8 audit project\"",
    "  dream cron run <job>",
    "  dream cron pause <job>",
    "  dream cron resume <job>",
    "  dream cron rename <job> <new name>",
    "  dream cron delete <job>",
    "  dream cron project list",
    "  dream cron project rename <project> <new name>",
    "  dream cron project delete <project>",
  ].join("\n"));
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
