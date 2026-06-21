import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { mcpConfigFilePath } from "./mcp-config.js";

const claudeMcpServerSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
});

const claudeMcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), claudeMcpServerSchema).optional(),
});

export async function importClaudeMcpConfig(
  pluginRoot: string,
  configRoot: string,
  pluginId: string,
): Promise<number> {
  const raw = await readOptional(join(pluginRoot, ".mcp.json"));
  if (raw === undefined) {
    return 0;
  }
  const parsedJson = parseJson(raw);
  if (parsedJson === undefined) {
    return 0;
  }
  const parsed = claudeMcpConfigSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return 0;
  }

  const servers = Object.entries(parsed.data.mcpServers ?? {});
  if (servers.length === 0) {
    return 0;
  }

  const filePath = mcpConfigFilePath(configRoot);
  const existing = await readOptional(filePath);
  const existingNames = new Set([...(existing ?? "").matchAll(/^\s*name\s*=\s*"([^"]+)"/gmu)].map((match) => match[1] ?? ""));
  const blocks = servers.flatMap(([name, server]) => {
    const importedName = `${pluginId}-${slugify(name)}`;
    return existingNames.has(importedName) ? [] : [formatServerBlock(importedName, server.command, server.args ?? [])];
  });
  if (blocks.length === 0) {
    return 0;
  }
  await mkdir(configRoot, { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${existing ?? ""}${existing?.endsWith("\n") === false ? "\n" : ""}${blocks.join("\n")}`, "utf8");
  return blocks.length;
}

function parseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

function formatServerBlock(name: string, command: string, args: readonly string[]): string {
  return [
    "[[server]]",
    `name = ${JSON.stringify(name)}`,
    `command = ${JSON.stringify(command)}`,
    `args = [${args.map((arg) => JSON.stringify(arg)).join(", ")}]`,
    "enabled = true",
    "",
  ].join("\n");
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

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "mcp";
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
