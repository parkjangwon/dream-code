import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { autoModelCategorySchema, modelTierSchema, type AutoModelCategory, type ModelTier, type SelectedModel } from "./model-routing.js";

export type StickyModel = {
  readonly provider: string;
  readonly model: string;
  readonly tier: ModelTier;
  readonly category?: AutoModelCategory;
  readonly agent?: string;
};

type StickyModelInput = {
  readonly provider: string;
  readonly model: string;
  readonly tier: ModelTier;
  readonly category?: AutoModelCategory | undefined;
  readonly agent?: string | undefined;
};

const stickyModelSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  tier: modelTierSchema,
  category: autoModelCategorySchema.optional(),
  agent: z.string().min(1).optional(),
});

export async function readStickyModel(root: string, sessionId: string | undefined): Promise<StickyModel | undefined> {
  if (sessionId === undefined) {
    return undefined;
  }
  try {
    const parsedJson: unknown = JSON.parse(await readFile(stickyModelPath(root, sessionId), "utf8"));
    const parsed = stickyModelSchema.safeParse(parsedJson);
    return parsed.success ? toStickyModel(parsed.data) : undefined;
  } catch (error) {
    if (error instanceof SyntaxError || (isErrnoException(error) && error.code === "ENOENT")) {
      return undefined;
    }
    throw error;
  }
}

export async function writeStickyModel(root: string, sessionId: string | undefined, selected: SelectedModel): Promise<void> {
  if (sessionId === undefined) {
    return;
  }
  const filePath = stickyModelPath(root, sessionId);
  await mkdir(join(root, "model-routing", "sessions"), { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${JSON.stringify(toStickyModel(selected), undefined, 2)}\n`, "utf8");
}

function stickyModelPath(root: string, sessionId: string): string {
  return join(root, "model-routing", "sessions", `${encodeURIComponent(sessionId)}.json`);
}

function toStickyModel(selected: StickyModelInput): StickyModel {
  return {
    provider: selected.provider,
    model: selected.model,
    tier: selected.tier,
    ...(selected.category === undefined ? {} : { category: selected.category }),
    ...(selected.agent === undefined ? {} : { agent: selected.agent }),
  };
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error;
}
