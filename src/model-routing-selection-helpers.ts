import type {
  ModelTier,
  SelectModelOptions,
  SelectedModel,
  SingleProviderModelConfig,
} from "./model-routing.js";

export function selectCandidateChain(
  specs: readonly string[],
  tier: ModelTier,
  options: SelectModelOptions,
  skipped: string[],
): readonly Omit<SelectedModel, "reason">[] {
  const selected: Omit<SelectedModel, "reason">[] = [];
  for (const spec of specs) {
    const candidate = parseCandidate(spec, tier);
    if (candidate === undefined) {
      skipped.push(spec);
      continue;
    }
    if (candidateAllowed(candidate.provider, candidate.model, options, skipped)) {
      selected.push(candidate);
    }
  }
  return selected;
}

export function candidateAllowed(
  provider: string,
  model: string,
  options: SelectModelOptions,
  skipped: string[],
): boolean {
  if (!providerAllowed(provider, options)) {
    skipped.push(`${provider}/${model}`);
    return false;
  }
  if (modelUnhealthy(provider, model, options)) {
    skipped.push(`${provider}/${model} unhealthy`);
    return false;
  }
  if (options.excludedModels?.has(modelKey(provider, model)) === true) {
    skipped.push(`${provider}/${model} failed`);
    return false;
  }
  if (options.modelAvailable?.(provider, model) === false) {
    skipped.push(`${provider}/${model} unavailable`);
    return false;
  }
  return true;
}

export function selectSingleProviderFallback(
  config: SingleProviderModelConfig,
  requestedTier: ModelTier | undefined,
): SelectedModel {
  const tier = requestedTier ?? config.defaultTier;
  return {
    provider: config.provider,
    model: modelNameForTier(config.models, tier),
    tier,
    reason: "single provider tier selection",
  };
}

export function modelKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

function providerAllowed(provider: string, options: SelectModelOptions): boolean {
  return options.connectedProviders === undefined || options.connectedProviders.has(provider);
}

function modelUnhealthy(provider: string, model: string, options: SelectModelOptions): boolean {
  return options.unhealthyModels?.has(`${provider}/${model}`) ?? false;
}

function parseCandidate(spec: string, tier: ModelTier): Omit<SelectedModel, "reason"> | undefined {
  const separator = spec.indexOf("/");
  if (separator <= 0 || separator >= spec.length - 1) {
    return undefined;
  }
  return {
    provider: spec.slice(0, separator),
    model: spec.slice(separator + 1),
    tier,
  };
}

function modelNameForTier(
  models: SingleProviderModelConfig["models"],
  tier: ModelTier,
): string {
  switch (tier) {
    case "low":
      return models.low;
    case "mid":
      return models.mid;
    case "high":
      return models.high;
    default:
      return assertNever(tier);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected model routing variant: ${String(value)}`);
}
