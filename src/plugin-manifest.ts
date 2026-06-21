import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const manifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

export type ClaudePluginManifest = z.infer<typeof manifestSchema>;

export class PluginManifestError extends Error {
  readonly filePath: string;

  constructor(filePath: string, reason: string) {
    super(`Could not parse Claude plugin manifest at ${filePath}: ${reason}`);
    this.name = "PluginManifestError";
    this.filePath = filePath;
  }
}

export async function readClaudePluginManifest(pluginRoot: string): Promise<ClaudePluginManifest> {
  const filePath = join(pluginRoot, ".claude-plugin", "plugin.json");
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new PluginManifestError(filePath, "missing .claude-plugin/plugin.json");
    }
    throw error;
  }

  const parsedJson = parseJson(raw, filePath);
  const parsed = manifestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new PluginManifestError(filePath, parsed.error.message);
  }
  return parsed.data;
}

function parseJson(raw: string, filePath: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new PluginManifestError(filePath, error.message);
    }
    throw error;
  }
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
