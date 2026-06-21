import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { defaultConfigRoot } from "./config.js";

export type CatalogProviderModels = {
  readonly provider: string;
  readonly fetchedAt: string;
  readonly source: "live" | "registry";
  readonly models: readonly string[];
};

export type ModelCatalog = {
  readonly version: 1;
  readonly providers: Readonly<Record<string, CatalogProviderModels>>;
};

const catalogProviderModelsSchema = z.object({
  provider: z.string().min(1),
  fetchedAt: z.string().min(1),
  source: z.enum(["live", "registry"]),
  models: z.array(z.string().min(1)),
});

const modelCatalogSchema = z.object({
  version: z.literal(1),
  providers: z.record(z.string(), catalogProviderModelsSchema),
});

export function emptyModelCatalog(): ModelCatalog {
  return {
    version: 1,
    providers: {},
  };
}

export function modelCatalogFilePath(root = defaultConfigRoot()): string {
  return join(root, "model_catalog.json");
}

export async function loadModelCatalog(root = defaultConfigRoot()): Promise<ModelCatalog> {
  const filePath = modelCatalogFilePath(root);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return emptyModelCatalog();
    }
    throw error;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return emptyModelCatalog();
    }
    throw error;
  }

  const parsed = modelCatalogSchema.safeParse(parsedJson);
  return parsed.success ? parsed.data : emptyModelCatalog();
}

export async function saveModelCatalog(root: string, catalog: ModelCatalog): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(modelCatalogFilePath(root), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}

export function upsertCatalogProvider(
  catalog: ModelCatalog,
  provider: CatalogProviderModels,
): ModelCatalog {
  return {
    version: 1,
    providers: {
      ...catalog.providers,
      [provider.provider]: {
        ...provider,
        models: unique(provider.models),
      },
    },
  };
}

export function catalogModelsForProvider(
  catalog: ModelCatalog | undefined,
  provider: string,
): readonly string[] {
  return catalog?.providers[provider]?.models ?? [];
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
