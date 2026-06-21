import { defaultAutoAgentRoutes, defaultAutoCategories } from "./model-routing-defaults.js";
import type {
  AutoModelAgentRoute,
  AutoModelCategory,
  AutoModelCategoryRoute,
  ModelConfig,
  ModelTier,
  SelectModelOptions,
  SelectedModel,
  SingleProviderModelConfig,
} from "./model-routing.js";

export function selectAutoCandidates(
  config: ModelConfig,
  prompt: string,
  requestedTier: ModelTier | undefined,
  options: SelectModelOptions,
): readonly SelectedModel[] {
  const candidates: SelectedModel[] = [];
  const skipped: string[] = [];

  for (const selected of prioritizedAutoCandidates(config, prompt, requestedTier, options, skipped)) {
    const key = modelKey(selected.provider, selected.model);
    if (candidates.some((candidate) => modelKey(candidate.provider, candidate.model) === key)) {
      continue;
    }
    candidates.push({
      ...selected,
      ...(skipped.length === 0 ? {} : { skipped: [...skipped] }),
    });
  }

  const fallback = selectSingleProviderFallback(config.single, requestedTier);
  if (
    candidateAllowed(fallback.provider, fallback.model, options, skipped)
    && !candidates.some((candidate) => modelKey(candidate.provider, candidate.model) === modelKey(fallback.provider, fallback.model))
  ) {
    candidates.push({
      ...fallback,
      reason: requestedTier === undefined ? "auto routing fallback" : "auto routing forced tier fallback",
    });
  }

  return candidates;
}

export function classifyPromptCategoryImpl(prompt: string, config?: ModelConfig): AutoModelCategory {
  const normalized = prompt.toLowerCase();
  for (const route of config === undefined ? defaultAutoCategories() : autoCategoriesImpl(config)) {
    if (route.match.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return route.id;
    }
  }
  return "quick";
}

export function autoCategoriesImpl(config: ModelConfig): readonly AutoModelCategoryRoute[] {
  return config.auto.categories ?? defaultAutoCategories();
}

export function autoAgentRoutesImpl(config: ModelConfig): readonly AutoModelAgentRoute[] {
  return config.auto.agentRoutes ?? defaultAutoAgentRoutes();
}

function prioritizedAutoCandidates(
  config: ModelConfig,
  prompt: string,
  requestedTier: ModelTier | undefined,
  options: SelectModelOptions,
  skipped: string[],
): readonly SelectedModel[] {
  const selected: SelectedModel[] = [];
  const agentRoute = options.agentId === undefined
    ? undefined
    : autoAgentRoutesImpl(config).find((route) => route.agent === options.agentId);
  if (agentRoute !== undefined) {
    selected.push(...selectCandidateChain(agentRoute.candidates, requestedTier ?? agentRoute.tier, options, skipped)
      .map((candidate) => ({
        ...candidate,
        agent: agentRoute.agent,
        reason: `auto agent route: ${agentRoute.agent}`,
      })));
  }

  const normalizedPrompt = prompt.toLowerCase();
  const matchedRoute = config.auto.routes.find((route) => {
    return route.match.some((keyword) => normalizedPrompt.includes(keyword.toLowerCase()));
  });

  if (matchedRoute !== undefined && requestedTier === undefined && candidateAllowed(matchedRoute.provider, matchedRoute.model, options, skipped)) {
    selected.push({
      provider: matchedRoute.provider,
      model: matchedRoute.model,
      tier: matchedRoute.tier,
      reason: `auto route: ${matchedRoute.id}`,
    });
  }

  const category = classifyPromptCategoryImpl(prompt, config);
  const categoryRoute = autoCategoriesImpl(config).find((route) => route.id === category);
  if (categoryRoute !== undefined) {
    selected.push(...selectCategoryCandidates(categoryRoute, requestedTier, options, skipped));
  }

  return selected;
}

function selectCategoryCandidates(
  route: AutoModelCategoryRoute,
  requestedTier: ModelTier | undefined,
  options: SelectModelOptions,
  skipped: string[],
): readonly SelectedModel[] {
  return selectCandidateChain(route.candidates, requestedTier ?? route.tier, options, skipped)
    .map((candidate) => ({
      ...candidate,
      category: route.id,
      reason: `auto category: ${route.label}`,
    }));
}

function selectCandidateChain(
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

function candidateAllowed(
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

function selectSingleProviderFallback(
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

function modelKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected model routing variant: ${String(value)}`);
}
