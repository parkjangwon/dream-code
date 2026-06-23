import type { ModelTier } from "./model-routing.js";

export type ModelProfile = {
  readonly model: string;
  readonly tier: ModelTier;
  readonly speed: "fast" | "balanced" | "deep";
  readonly quality: "cheap" | "balanced" | "strong";
};

export function inferModelProfile(model: string): ModelProfile {
  const tier = inferModelTier(model);
  return {
    model,
    tier,
    speed: speedForTier(tier),
    quality: qualityForTier(tier),
  };
}

export function bestModelForTier(models: readonly string[], tier: ModelTier): string | undefined {
  const ranked = models
    .map(inferModelProfile)
    .filter((profile) => profile.tier === tier)
    .sort((left, right) => modelStrengthScore(right.model) - modelStrengthScore(left.model));
  return ranked[0]?.model;
}

function inferModelTier(model: string): ModelTier {
  const normalized = model.toLowerCase();
  if (matchesAny(normalized, ["nano", "lite", "flash", "small", "fast", "highspeed", "20b"])) {
    return "low";
  }
  if (matchesAny(normalized, ["pro", "max", "ultra", "opus", "xhigh", "codex", "glm-5", "gpt-5", "480b", "405b", "120b"])) {
    return "high";
  }
  return "mid";
}

export function modelStrengthScore(model: string): number {
  const normalized = model.toLowerCase();
  let score = 0;
  if (normalized.includes("fugu-ultra")) {
    score += 400;
  }
  if (normalized.includes("gpt-5.5")) {
    score += 360;
  } else if (normalized.includes("gpt-5.4")) {
    score += 300;
  } else if (normalized.includes("gpt-5")) {
    score += 260;
  }
  if (normalized.includes("glm-5.2")) {
    score += 320;
  } else if (normalized.includes("glm-5")) {
    score += 280;
  }
  if (normalized.includes("deepseek-v4-pro")) {
    score += 170;
  }
  if (matchesAny(normalized, ["pro", "max", "ultra", "opus", "xhigh", "codex"])) {
    score += 100;
  }
  if (matchesAny(normalized, ["flash", "lite", "nano", "small", "fast"])) {
    score -= 50;
  }
  const sizes = [...normalized.matchAll(/(\d+)\s*b/gu)].map((match) => Number(match[1]));
  return score + Math.max(0, ...sizes);
}

function speedForTier(tier: ModelTier): ModelProfile["speed"] {
  switch (tier) {
    case "low":
      return "fast";
    case "mid":
      return "balanced";
    case "high":
      return "deep";
    default:
      return assertNever(tier);
  }
}

function qualityForTier(tier: ModelTier): ModelProfile["quality"] {
  switch (tier) {
    case "low":
      return "cheap";
    case "mid":
      return "balanced";
    case "high":
      return "strong";
    default:
      return assertNever(tier);
  }
}

function matchesAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function assertNever(value: never): never {
  throw new Error(`Unexpected model tier: ${String(value)}`);
}
