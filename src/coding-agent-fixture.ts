import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runAgentToolRequest } from "./agent-tools.js";
import { runCommandEvaluator } from "./loop-command-evaluator.js";

export type FixtureRepairResult = {
  readonly ok: boolean;
  readonly detail: string;
};

export async function runFixtureRepairEval(configRoot: string): Promise<FixtureRepairResult> {
  await mkdir(configRoot, { recursive: true, mode: 0o700 });
  const workspace = await mkdtemp(join(configRoot, "eval-fixture-"));
  try {
    await writeFile(join(workspace, "math.mjs"), "export function add(left, right) {\n  return left - right;\n}\n", "utf8");
    await writeFile(join(workspace, "check.mjs"), [
      "import { add } from './math.mjs';",
      "if (add(2, 3) !== 5) {",
      "  console.error('expected add(2, 3) to equal 5');",
      "  process.exit(1);",
      "}",
    ].join("\n"), "utf8");

    const before = await runCheck(workspace);
    const edit = await runAgentToolRequest({
      tool: "edit",
      path: "math.mjs",
      search: "return left - right;",
      replace: "return left + right;",
      expectedReplacements: 1,
    }, { mode: "yolo", workspaceRoot: workspace });
    const after = await runCheck(workspace);
    const ok = !before.passed && edit.ok && after.passed;
    return {
      ok,
      detail: ok
        ? "fixture bug was reproduced, repaired through workspace tools, and verified"
        : "fixture repair did not complete the reproduce-fix-verify cycle",
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function runCheck(workspace: string): ReturnType<typeof runCommandEvaluator> {
  return runCommandEvaluator({
    workspace,
    evaluator: {
      type: "command",
      command: process.execPath,
      args: ["check.mjs"],
      passExitCodes: [0],
      timeoutMs: 5_000,
    },
  });
}
