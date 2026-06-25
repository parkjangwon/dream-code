import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createAgentMessages } from "./agent-messages.js";
import { runFixtureRepairEval } from "./coding-agent-fixture.js";
import { startAgentRun } from "./agent-run-store.js";
import { loadAgentRunTelemetry } from "./agent-run-telemetry.js";
import { runAgentToolRequest } from "./agent-tools.js";
import type { DreamConfig } from "./config.js";
import { analyzeDiffRisk, changedFilesForGit } from "./diff-risk.js";
import { runLoopSpec } from "./loop-engine.js";
import { parseLoopSpec } from "./loop-spec.js";
import { parseModelList } from "./model-discovery.js";

export type CodingAgentEvalStatus = "pass" | "warn" | "fail";

export type CodingAgentEvalCheck = {
  readonly id: string;
  readonly label: string;
  readonly status: CodingAgentEvalStatus;
  readonly detail: string;
  readonly repair: string;
};

export type CodingAgentEvalReport = {
  readonly title: "Dream Coding Agent Eval";
  readonly cwd: string;
  readonly ok: boolean;
  readonly score: number;
  readonly checks: readonly CodingAgentEvalCheck[];
};

export type CodingAgentEvalOptions = {
  readonly cwd: string;
  readonly configRoot: string;
  readonly config: DreamConfig;
};

export async function runCodingAgentEval(options: CodingAgentEvalOptions): Promise<CodingAgentEvalReport> {
  const checks = [
    await evalHarnessCheck(options.cwd),
    selfReviewCheck(),
    await loopStabilityCheck(options.configRoot),
    providerCompatibilityCheck(),
    await observabilityCheck(options.configRoot),
    await fixtureRepairCheck(options.configRoot),
    await diffRiskCheck(options.cwd),
  ];
  const passCount = checks.filter((check) => check.status === "pass").length;
  const score = Math.round((passCount / checks.length) * 100);
  return {
    title: "Dream Coding Agent Eval",
    cwd: options.cwd,
    ok: checks.every((check) => check.status !== "fail"),
    score,
    checks,
  };
}

export function formatCodingAgentEvalReport(report: CodingAgentEvalReport): string {
  return [
    report.title,
    `cwd ${report.cwd}`,
    `score ${report.score}`,
    `status ${report.ok ? "pass" : "fail"}`,
    "",
    ...report.checks.map((check) => `${check.status} ${check.label} - ${check.detail}\n  repair: ${check.repair}`),
  ].join("\n");
}

async function evalHarnessCheck(cwd: string): Promise<CodingAgentEvalCheck> {
  const result = await runAgentToolRequest(
    { tool: "write", path: ".dream-eval-probe", content: "no" },
    { mode: "plan", workspaceRoot: cwd },
  );
  const passed = !result.ok && /Plan mode/u.test(result.output);
  return check(
    "eval-harness",
    "evaluation harness",
    passed,
    passed ? "deterministic permission-gate scenario passed" : "permission-gate scenario did not fail closed",
    "Inspect agent tool permission policy and keep eval scenarios deterministic.",
  );
}

function selfReviewCheck(): CodingAgentEvalCheck {
  const system = createAgentMessages("edit code")[0]?.content ?? "";
  const passed = /review your own diff/u.test(system) && /Before final response/u.test(system);
  return check(
    "self-review",
    "self review",
    passed,
    passed ? "agent prompt requires diff and verification review before final response" : "agent prompt lacks final self-review discipline",
    "Update the base agent system prompt with explicit final diff and verification review requirements.",
  );
}

async function loopStabilityCheck(configRoot: string): Promise<CodingAgentEvalCheck> {
  const workspace = await mkdtemp(join(configRoot, "eval-loop-"));
  try {
    await writeFile(join(workspace, "check.mjs"), "console.error('same failure'); process.exit(2);\n", "utf8");
    const prompts: string[] = [];
    await runLoopSpec({
      workspace,
      spec: parseLoopSpec(JSON.stringify({
        version: 1,
        name: "eval-loop",
        goal: "Detect repeated failures",
        maxTurns: 3,
        evaluator: {
          type: "command",
          command: process.execPath,
          args: ["check.mjs"],
        },
      })),
      runAgent: async ({ prompt }) => {
        prompts.push(prompt);
        return "attempted";
      },
    });
    const passed = /Repeated evaluator failure: 2 consecutive matches/u.test(prompts[2] ?? "");
    return check(
      "loop-stability",
      "loop stability",
      passed,
      passed ? "loop retry prompt identifies repeated evaluator failures" : "loop retry prompt missed repeated failure context",
      "Add repeated-failure signatures to loop prompts so the agent changes strategy after identical failures.",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function providerCompatibilityCheck(): CodingAgentEvalCheck {
  const models = parseModelList(JSON.stringify({
    data: [{ id: "fast" }, { name: "balanced" }, { model: "pro" }],
  }));
  const passed = models.join(",") === "fast,balanced,pro";
  return check(
    "provider-compat",
    "provider compatibility",
    passed,
    passed ? "OpenAI-compatible model variants parse correctly" : "OpenAI-compatible model variants failed to parse",
    "Expand model discovery parsing for common provider response shapes.",
  );
}

async function observabilityCheck(configRoot: string): Promise<CodingAgentEvalCheck> {
  const run = await startAgentRun(configRoot, {
    id: "eval-observability",
    kind: "agent",
    agentId: "dream",
    agentName: "Dream",
    prompt: "record telemetry",
  });
  run.tool("read package.json", { ok: true, durationMs: 1, risk: "read-only" });
  await run.finish("done");
  const records = await loadAgentRunTelemetry(configRoot);
  const passed = records.some((record) => record.runId === "eval-observability" && record.toolCalls === 1);
  return check(
    "observability",
    "observability",
    passed,
    passed ? "agent runs emit structured JSONL telemetry" : "agent run telemetry was not recorded",
    "Record run status, duration, tool calls, and file changes when each agent run finishes.",
  );
}

async function fixtureRepairCheck(configRoot: string): Promise<CodingAgentEvalCheck> {
  const result = await runFixtureRepairEval(configRoot);
  return check(
    "fixture-repair",
    "fixture repair",
    result.ok,
    result.detail,
    "Keep a deterministic fixture that reproduces, fixes, and verifies a small code defect through real workspace tools.",
  );
}

async function diffRiskCheck(cwd: string): Promise<CodingAgentEvalCheck> {
  const assessment = analyzeDiffRisk(await changedFilesForGit(cwd));
  return {
    id: "diff-risk",
    label: "diff risk",
    status: assessment.status,
    detail: assessment.detail,
    repair: assessment.status === "pass"
      ? "No action required."
      : "Add focused tests or split risky package/large changes before release.",
  };
}

function check(
  id: string,
  label: string,
  passed: boolean,
  detail: string,
  repair: string,
): CodingAgentEvalCheck {
  return { id, label, status: passed ? "pass" : "fail", detail, repair };
}
