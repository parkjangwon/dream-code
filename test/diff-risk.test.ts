import assert from "node:assert/strict";
import test from "node:test";

import { analyzeDiffRisk } from "../src/diff-risk.js";

test("analyzeDiffRisk passes source changes with matching tests", () => {
  const assessment = analyzeDiffRisk([
    "src/coding-agent-eval.ts",
    "test/coding-agent-eval.test.ts",
  ]);

  assert.equal(assessment.status, "pass");
  assert.equal(assessment.signals.includes("source-and-test"), true);
});

test("analyzeDiffRisk warns when source changes lack tests", () => {
  const assessment = analyzeDiffRisk([
    "src/coding-agent-eval.ts",
    "README.md",
  ]);

  assert.equal(assessment.status, "warn");
  assert.equal(assessment.signals.includes("source-without-tests"), true);
});

test("analyzeDiffRisk warns for package manifest changes", () => {
  const assessment = analyzeDiffRisk([
    "package.json",
    "package-lock.json",
    "test/release-check.test.ts",
  ]);

  assert.equal(assessment.status, "warn");
  assert.equal(assessment.signals.includes("package-surface"), true);
});
