import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const memoryIndexEntrySchema = z.object({
  version: z.literal(1),
  kind: z.enum(["checkpoint", "task-progress"]),
  path: z.string().min(1),
  title: z.string().min(1),
  preview: z.string(),
  updatedAt: z.string(),
});

export type MemoryIndexEntry = z.infer<typeof memoryIndexEntrySchema>;

export type AppendMemoryIndexInput = {
  readonly kind: MemoryIndexEntry["kind"];
  readonly path: string;
  readonly title: string;
  readonly body: string;
};

export async function appendMemoryIndex(projectRoot: string, input: AppendMemoryIndexInput): Promise<void> {
  const entry: MemoryIndexEntry = {
    version: 1,
    kind: input.kind,
    path: input.path,
    title: input.title,
    preview: preview(input.body),
    updatedAt: new Date().toISOString(),
  };
  await appendFile(memoryIndexPath(projectRoot), `${JSON.stringify(entry)}\n`, "utf8");
}

export async function relevantMemoryEntries(projectRoot: string, query = "", limit = 5): Promise<readonly MemoryIndexEntry[]> {
  const entries = await readMemoryIndex(projectRoot);
  const latest = latestByPath(entries);
  return latest
    .map((entry) => ({ entry, score: relevanceScore(entry, query) }))
    .sort((left, right) => right.score - left.score || right.entry.updatedAt.localeCompare(left.entry.updatedAt))
    .slice(0, limit)
    .map((ranked) => ranked.entry);
}

function memoryIndexPath(projectRoot: string): string {
  return join(projectRoot, "index.jsonl");
}

async function readMemoryIndex(projectRoot: string): Promise<readonly MemoryIndexEntry[]> {
  try {
    return (await readFile(memoryIndexPath(projectRoot), "utf8"))
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map(parseEntry)
      .filter(isEntry);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function latestByPath(entries: readonly MemoryIndexEntry[]): readonly MemoryIndexEntry[] {
  const values = new Map<string, MemoryIndexEntry>();
  for (const entry of entries) {
    const current = values.get(entry.path);
    if (current === undefined || entry.updatedAt > current.updatedAt) {
      values.set(entry.path, entry);
    }
  }
  return [...values.values()];
}

function relevanceScore(entry: MemoryIndexEntry, query: string): number {
  const haystack = `${entry.title} ${entry.preview}`.toLowerCase();
  const tokens = query.toLowerCase().split(/[^\p{L}\p{N}_./-]+/u).filter((token) => token.length >= 2);
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function parseEntry(line: string): MemoryIndexEntry | undefined {
  try {
    const parsed = memoryIndexEntrySchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : undefined;
  } catch (error) {
    return error instanceof SyntaxError ? undefined : raise(error);
  }
}

function preview(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function isEntry(value: MemoryIndexEntry | undefined): value is MemoryIndexEntry {
  return value !== undefined;
}

function raise(error: unknown): never {
  throw error;
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
