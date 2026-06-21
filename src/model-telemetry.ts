import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { ansi, paint } from "./ansi.js";
import type { AutoModelCategory } from "./model-routing.js";

const telemetryRecordSchema = z.object({
  version: z.literal(1),
  at: z.string(),
  provider: z.string().min(1),
  model: z.string().min(1),
  category: z.string().optional(),
  ok: z.boolean(),
  elapsedMs: z.number().nonnegative(),
  inputChars: z.number().int().nonnegative(),
  outputChars: z.number().int().nonnegative(),
  error: z.string().optional(),
});

export type ModelTelemetryInput = {
  readonly provider: string;
  readonly model: string;
  readonly category?: AutoModelCategory | string;
  readonly ok: boolean;
  readonly elapsedMs: number;
  readonly inputChars: number;
  readonly outputChars: number;
  readonly error?: string;
};

type ModelTelemetryRecord = z.infer<typeof telemetryRecordSchema>;

export type ModelHealthOptions = {
  readonly window?: number;
  readonly minCalls?: number;
  readonly failureRate?: number;
};

export function modelTelemetryPath(root: string): string {
  return join(root, "model_telemetry.jsonl");
}

export async function recordModelTelemetry(root: string, input: ModelTelemetryInput): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const record = telemetryRecord(input);
  await appendFile(modelTelemetryPath(root), `${JSON.stringify(record)}\n`, "utf8");
}

export async function loadModelTelemetry(root: string): Promise<readonly ModelTelemetryRecord[]> {
  const content = await readOptional(modelTelemetryPath(root));
  if (content === undefined) {
    return [];
  }
  return content.split(/\r?\n/u).filter((line) => line.trim().length > 0).map(parseTelemetryRecord);
}

export async function formatModelTelemetry(root: string): Promise<string> {
  const records = await loadModelTelemetry(root);
  if (records.length === 0) {
    return `${paint("Model Health", `${ansi.bold}${ansi.accent}`)}\n${paint("No model calls recorded yet.", ansi.dim)}`;
  }
  const recent = summarize(records.slice(-50));
  return [
    paint("Model Health", `${ansi.bold}${ansi.accent}`),
    ...recent.map((item) => [
      `${paint(item.key, ansi.blue)} ${item.ok}/${item.count} ok`,
      `${paint("avg", ansi.muted)} ${formatSeconds(item.avgMs)} ${paint("tokens", ansi.muted)} ~${item.tokens}`,
    ].join(" · ")),
  ].join("\n");
}

export async function formatModelTelemetrySummary(root: string): Promise<string> {
  const records = await loadModelTelemetry(root);
  if (records.length === 0) {
    return "models: no calls yet";
  }
  const latest = records[records.length - 1];
  if (latest === undefined) {
    return "models: no calls yet";
  }
  const ok = records.filter((record) => record.ok).length;
  return `models: ${ok}/${records.length} ok, latest ${latest.provider}/${latest.model}`;
}

export async function loadUnhealthyModelKeys(
  root: string,
  options: ModelHealthOptions = {},
): Promise<ReadonlySet<string>> {
  const minCalls = options.minCalls ?? 3;
  const failureRate = options.failureRate ?? 0.6;
  const records = (await loadModelTelemetry(root)).slice(-(options.window ?? 40));
  const groups = new Map<string, { count: number; failed: number }>();
  for (const record of records) {
    const key = modelKey(record.provider, record.model);
    const previous = groups.get(key) ?? { count: 0, failed: 0 };
    groups.set(key, {
      count: previous.count + 1,
      failed: previous.failed + (record.ok ? 0 : 1),
    });
  }
  return new Set([...groups.entries()]
    .filter((entry) => entry[1].count >= minCalls && entry[1].failed / entry[1].count >= failureRate)
    .map((entry) => entry[0]));
}

function telemetryRecord(input: ModelTelemetryInput): ModelTelemetryRecord {
  const base = {
    version: 1 as const,
    at: new Date().toISOString(),
    provider: input.provider,
    model: input.model,
    ok: input.ok,
    elapsedMs: Math.max(0, input.elapsedMs),
    inputChars: Math.max(0, input.inputChars),
    outputChars: Math.max(0, input.outputChars),
  };
  return {
    ...base,
    ...(input.category === undefined ? {} : { category: input.category }),
    ...(input.error === undefined ? {} : { error: input.error }),
  };
}

function summarize(records: readonly ModelTelemetryRecord[]) {
  const groups = new Map<string, { count: number; ok: number; elapsedMs: number; chars: number }>();
  for (const record of records) {
    const key = `${record.provider}/${record.model}`;
    const previous = groups.get(key) ?? { count: 0, ok: 0, elapsedMs: 0, chars: 0 };
    groups.set(key, {
      count: previous.count + 1,
      ok: previous.ok + (record.ok ? 1 : 0),
      elapsedMs: previous.elapsedMs + record.elapsedMs,
      chars: previous.chars + record.inputChars + record.outputChars,
    });
  }
  return [...groups.entries()].map(([key, value]) => ({
    key,
    count: value.count,
    ok: value.ok,
    avgMs: value.elapsedMs / value.count,
    tokens: Math.ceil(value.chars / 4),
  })).sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function modelKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

function parseTelemetryRecord(line: string): ModelTelemetryRecord {
  const parsedJson: unknown = JSON.parse(line);
  return telemetryRecordSchema.parse(parsedJson);
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
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
