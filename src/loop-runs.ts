import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { LoopRunResult } from "./loop-engine.js";
import type { LoopSpec } from "./loop-spec.js";

export type SaveLoopRunInput = {
  readonly specPath: string;
  readonly workspace: string;
  readonly spec: LoopSpec;
  readonly result: LoopRunResult;
};

export async function saveLoopRun(root: string, input: SaveLoopRunInput): Promise<string> {
  const startedAt = new Date().toISOString();
  const filePath = join(loopRunsRoot(root), `${runId(startedAt)}.json`);
  await mkdir(loopRunsRoot(root), { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${JSON.stringify({
    version: 1,
    startedAt,
    specPath: input.specPath,
    workspace: input.workspace,
    spec: input.spec,
    ...input.result,
  }, null, 2)}\n`, "utf8");
  return filePath;
}

function loopRunsRoot(root: string): string {
  return join(root, "loops", "runs");
}

function runId(timestamp: string): string {
  return `loop_${timestamp.replace(/[-:.]/gu, "")}_${Math.random().toString(36).slice(2, 8)}`;
}
