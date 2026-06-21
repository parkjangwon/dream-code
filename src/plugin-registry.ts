import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const pluginRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  source: z.string().min(1),
  installedAt: z.string().min(1),
  skills: z.number().int().min(0),
  agents: z.number().int().min(0),
  commands: z.number().int().min(0),
  mcpServers: z.number().int().min(0),
});

export type PluginRecord = z.infer<typeof pluginRecordSchema>;

const registrySchema = z.object({
  version: z.literal(1),
  plugins: z.array(pluginRecordSchema),
});

export function pluginRegistryPath(root: string): string {
  return join(root, "plugins", "plugins.json");
}

export async function loadPluginRecords(root: string): Promise<readonly PluginRecord[]> {
  const filePath = pluginRegistryPath(root);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsedJson: unknown = JSON.parse(raw);
    const parsed = registrySchema.safeParse(parsedJson);
    return parsed.success ? parsed.data.plugins : [];
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    if (error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }
}

export async function savePluginRecord(root: string, record: PluginRecord): Promise<void> {
  const records = (await loadPluginRecords(root)).filter((existing) => existing.id !== record.id);
  const next = [...records, record].sort((left, right) => left.name.localeCompare(right.name));
  await writePluginRecords(root, next);
}

export async function deletePluginRecord(root: string, pluginId: string): Promise<PluginRecord | undefined> {
  const records = await loadPluginRecords(root);
  const removed = records.find((record) => record.id === pluginId);
  if (removed === undefined) {
    return undefined;
  }
  await writePluginRecords(root, records.filter((record) => record.id !== pluginId));
  return removed;
}

async function writePluginRecords(root: string, records: readonly PluginRecord[]): Promise<void> {
  await mkdir(join(root, "plugins"), { recursive: true, mode: 0o700 });
  await writeFile(pluginRegistryPath(root), `${JSON.stringify({ version: 1, plugins: records }, null, 2)}\n`, "utf8");
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
