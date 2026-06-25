import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { defaultConfig } from "../src/config.js";
import { formatCodingAgentEvalReport, runCodingAgentEval } from "../src/coding-agent-eval.js";

test("runCodingAgentEval produces deterministic coding-agent readiness evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-coding-eval-"));
  try {
    const report = await runCodingAgentEval({
      cwd: process.cwd(),
      configRoot: root,
      config: defaultConfig(),
    });

    assert.equal(report.title, "Dream Coding Agent Eval");
    assert.equal(report.ok, true);
    assert.equal(report.score >= 85, true);
    assert.equal(report.checks.every((check) => check.status !== "fail"), true);
    assert.equal(report.checks.some((check) => check.id === "eval-harness"), true);
    assert.equal(report.checks.some((check) => check.id === "self-review"), true);
    assert.equal(report.checks.some((check) => check.id === "loop-stability"), true);
    assert.equal(report.checks.some((check) => check.id === "provider-compat"), true);
    assert.equal(report.checks.some((check) => check.id === "observability"), true);
    assert.equal(report.checks.some((check) => check.id === "fixture-repair"), true);
    assert.equal(report.checks.some((check) => check.id === "diff-risk"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatCodingAgentEvalReport summarizes score and repair guidance", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-coding-eval-format-"));
  try {
    const report = await runCodingAgentEval({
      cwd: process.cwd(),
      configRoot: root,
      config: defaultConfig(),
    });
    const formatted = formatCodingAgentEvalReport(report);

    assert.match(formatted, /Dream Coding Agent Eval/u);
    assert.match(formatted, /score \d+/u);
    assert.match(formatted, /repair:/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
