import type { AutoModelCategory, ModelTier } from "./model-routing.js";

export function categoryPriority(category: AutoModelCategory): number {
  switch (category) {
    case "ultrabrain":
      return 100;
    case "architect":
      return 90;
    case "deep":
      return 80;
    case "visual":
      return 60;
    case "coding":
      return 50;
    case "tool":
      return 40;
    case "executor":
      return 30;
    case "reader":
      return 20;
    case "writing":
      return 10;
    case "quick":
      return 0;
    default:
      return assertNever(category);
  }
}

export function shouldEscalateForComplexity(prompt: string, category: AutoModelCategory): boolean {
  if (category !== "coding" && category !== "visual") {
    return false;
  }
  return complexityScore(prompt) >= 4;
}

export function shouldKeepStickyModel(
  prompt: string,
  category: AutoModelCategory,
  stickyTier: ModelTier,
  targetTier: ModelTier,
  stickyCategory?: AutoModelCategory,
): boolean {
  if (stickyTier === targetTier) {
    return stickyCategory === category || (isContinuationPrompt(prompt) && stickyCategoryApplies(stickyCategory));
  }
  return stickyTier === "high"
    && isContinuationPrompt(prompt)
    && (isContinuationCategory(category) || stickyCategoryApplies(stickyCategory));
}

function complexityScore(prompt: string): number {
  const normalized = prompt.toLowerCase();
  const weightedSignals: readonly [readonly string[], number][] = [
    [["across", "multi-file", "multiple files", "many files", "entire", "end-to-end", "cross-module", "cross module"], 2],
    [["backward compatibility", "compatibility", "migration safety", "rollout", "roll back", "rollback"], 2],
    [["concurrency", "race", "deadlock", "parallel", "distributed"], 2],
    [["security", "auth", "permissions", "privacy", "compliance"], 2],
    [["error handling", "failure", "recovery", "resilience", "edge cases"], 1],
    [["database", "storage", "api", "cli", "frontend", "backend", "tests"], 1],
  ];
  return weightedSignals.reduce((score, [signals, weight]) => {
    return score + signals.filter((signal) => normalized.includes(signal)).length * weight;
  }, 0);
}

function isContinuationPrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return ["continue", "follow up", "same task", "keep going", "update the tests", "finish this"].some((signal) => {
    return normalized.includes(signal);
  });
}

function isContinuationCategory(category: AutoModelCategory): boolean {
  switch (category) {
    case "coding":
    case "visual":
    case "deep":
    case "ultrabrain":
    case "architect":
      return true;
    case "quick":
    case "tool":
    case "reader":
    case "writing":
    case "executor":
      return false;
    default:
      return assertNever(category);
  }
}

function stickyCategoryApplies(category: AutoModelCategory | undefined): boolean {
  return category !== undefined && isContinuationCategory(category);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected auto model category: ${String(value)}`);
}
