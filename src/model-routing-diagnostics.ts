import type { ModelTier, SelectedModel } from "./model-routing.js";

export type RouteDiagnostics = {
  readonly health: "healthy";
  readonly tier: ModelTier;
  readonly cost: "economy" | "balanced" | "premium";
  readonly speed: "fast" | "steady" | "deep";
  readonly degraded: readonly string[];
};

export function routeDiagnostics(selected: SelectedModel): RouteDiagnostics {
  return {
    health: "healthy",
    tier: selected.tier,
    cost: costTier(selected.tier),
    speed: speedTier(selected.tier),
    degraded: selected.skipped?.filter((item) => item.endsWith(" unhealthy")) ?? [],
  };
}

export function formatRouteDiagnostics(selected: SelectedModel): string {
  const diagnostics = routeDiagnostics(selected);
  const degraded = diagnostics.degraded.length === 0 ? "" : ` · degraded: ${diagnostics.degraded.join(", ")}`;
  return `health: ${diagnostics.health} · tier: ${diagnostics.tier} · cost: ${diagnostics.cost} · speed: ${diagnostics.speed}${degraded}`;
}

function costTier(tier: ModelTier): RouteDiagnostics["cost"] {
  switch (tier) {
    case "low":
      return "economy";
    case "mid":
      return "balanced";
    case "high":
      return "premium";
    default:
      return assertNever(tier);
  }
}

function speedTier(tier: ModelTier): RouteDiagnostics["speed"] {
  switch (tier) {
    case "low":
      return "fast";
    case "mid":
      return "steady";
    case "high":
      return "deep";
    default:
      return assertNever(tier);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected model tier: ${String(value)}`);
}
