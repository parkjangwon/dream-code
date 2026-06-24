import { defaultConfig } from "./config.js";
import { bootstrapAutoModelConfig } from "./model-auto-bootstrap.js";
import { autoCategories, selectModelCandidatesForPrompt, type ModelConfig, type ModelTier, type SelectedModel } from "./model-routing.js";

export type ProviderRoutingDiagnostics = {
  readonly title: "Dream Provider Routing Diagnostics";
  readonly selected: ProviderRoutingCandidate;
  readonly candidates: readonly ProviderRoutingCandidate[];
};

export type ProviderRoutingCandidate = {
  readonly provider: string;
  readonly model: string;
  readonly tier: ModelTier;
  readonly health: "healthy" | "unhealthy";
  readonly costTier: "low" | "medium" | "high";
  readonly speedTier: "fast" | "balanced" | "deep";
  readonly reason: string;
  readonly degradationReason?: string;
};

export type ProviderRoutingDiagnosticsInput = {
  readonly prompt: string;
  readonly config?: ModelConfig;
  readonly connectedProviders?: ReadonlySet<string>;
  readonly unhealthyModels?: ReadonlySet<string>;
};

export function formatProviderRoutingDiagnostics(input: ProviderRoutingDiagnosticsInput): ProviderRoutingDiagnostics {
  const config = input.config ?? bootstrapAutoModelConfig(defaultConfig(), input.connectedProviders ?? new Set()).model;
  const selected = selectModelCandidatesForPrompt(config, input.prompt, undefined, {
    ...(input.connectedProviders === undefined ? {} : { connectedProviders: input.connectedProviders }),
    ...(input.unhealthyModels === undefined ? {} : { unhealthyModels: input.unhealthyModels }),
  });
  const allCandidates = collectCategoryCandidates(config, input.prompt);
  const rows = [...selected, ...allCandidates]
    .filter((candidate, index, candidates) => candidates.findIndex((item) => modelKey(item) === modelKey(candidate)) === index)
    .map((candidate) => describeCandidate(candidate, input.unhealthyModels));
  const healthy = rows.find((candidate) => candidate.health === "healthy");
  return {
    title: "Dream Provider Routing Diagnostics",
    selected: healthy ?? rows[0] ?? describeCandidate({
      provider: config.single.provider,
      model: config.single.models[config.single.defaultTier],
      tier: config.single.defaultTier,
      reason: "single provider fallback",
    }, input.unhealthyModels),
    candidates: rows,
  };
}

export function formatProviderRoutingDiagnosticsText(report: ProviderRoutingDiagnostics): string {
  return [
    report.title,
    `selected: ${report.selected.provider}/${report.selected.model} ${report.selected.health} cost=${report.selected.costTier} speed=${report.selected.speedTier}`,
    ...report.candidates.map((candidate) => [
      `- ${candidate.provider}/${candidate.model}`,
      candidate.health,
      `cost=${candidate.costTier}`,
      `speed=${candidate.speedTier}`,
      candidate.degradationReason === undefined ? "" : `degraded=${candidate.degradationReason}`,
    ].filter(Boolean).join(" ")),
    "",
  ].join("\n");
}

function collectCategoryCandidates(config: ModelConfig, prompt: string): readonly SelectedModel[] {
  const normalized = prompt.toLowerCase();
  return autoCategories(config)
    .filter((route) => route.match.some((keyword) => normalized.includes(keyword.toLowerCase())))
    .flatMap((route) => route.candidates.map((spec) => candidateFromSpec(spec, route.tier, `category candidate: ${route.label}`)))
    .filter(isSelectedModel);
}

function candidateFromSpec(spec: string, tier: ModelTier, reason: string): SelectedModel | undefined {
  const separator = spec.indexOf("/");
  if (separator <= 0 || separator >= spec.length - 1) {
    return undefined;
  }
  return { provider: spec.slice(0, separator), model: spec.slice(separator + 1), tier, reason };
}

function describeCandidate(candidate: SelectedModel, unhealthyModels?: ReadonlySet<string>): ProviderRoutingCandidate {
  const health = unhealthyModels?.has(modelKey(candidate)) === true ? "unhealthy" : "healthy";
  return {
    provider: candidate.provider,
    model: candidate.model,
    tier: candidate.tier,
    health,
    costTier: costTier(candidate.tier),
    speedTier: speedTier(candidate.tier),
    reason: candidate.reason,
    ...(health === "healthy" ? {} : { degradationReason: "recent failures" }),
  };
}

function costTier(tier: ModelTier): ProviderRoutingCandidate["costTier"] {
  return tier === "low" ? "low" : tier === "mid" ? "medium" : "high";
}

function speedTier(tier: ModelTier): ProviderRoutingCandidate["speedTier"] {
  return tier === "low" ? "fast" : tier === "mid" ? "balanced" : "deep";
}

function modelKey(candidate: Pick<SelectedModel, "provider" | "model">): string {
  return `${candidate.provider}/${candidate.model}`;
}

function isSelectedModel(candidate: SelectedModel | undefined): candidate is SelectedModel {
  return candidate !== undefined;
}
