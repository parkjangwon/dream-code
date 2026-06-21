import type { DreamConfig } from "./config.js";
import { defaultAutoAgentRoutes, defaultAutoCategories } from "./model-routing-defaults.js";
import type { ModelConfig } from "./model-routing.js";
import { providerModelIdForRequest } from "./provider-registry.js";

export function defaultModelConfig(): ModelConfig {
  return {
    mode: "single",
    single: {
      provider: "openai",
      models: {
        low: "gpt-5.4-mini",
        mid: "gpt-5.5",
        high: "gpt-5.5",
      },
      defaultTier: "mid",
    },
    auto: {
      preferConnectedProviders: true,
      routes: [
        {
          id: "fast-classifier",
          provider: "openai",
          model: "gpt-5.4-mini",
          tier: "low",
          match: ["classify", "summarize", "rename", "grep"],
        },
        {
          id: "deep-builder",
          provider: "openai",
          model: "gpt-5.5",
          tier: "high",
          match: ["architecture", "debug", "refactor", "review"],
        },
      ],
      categories: [...defaultAutoCategories()],
      agentRoutes: [...defaultAutoAgentRoutes()],
    },
  };
}

export function normalizeLoadedConfig(config: DreamConfig): DreamConfig {
  return {
    ...config,
    model: {
      ...config.model,
      single: {
        ...config.model.single,
        models: {
          low: providerModelIdForRequest(config.model.single.provider, config.model.single.models.low),
          mid: providerModelIdForRequest(config.model.single.provider, config.model.single.models.mid),
          high: providerModelIdForRequest(config.model.single.provider, config.model.single.models.high),
        },
      },
      auto: {
        preferConnectedProviders: config.model.auto.preferConnectedProviders ?? true,
        routes: config.model.auto.routes.map((route) => ({
          ...route,
          model: providerModelIdForRequest(route.provider, route.model),
        })),
        categories: (config.model.auto.categories ?? defaultAutoCategories()).map((category) => ({
          ...category,
          candidates: category.candidates.map(normalizeCandidateSpec),
        })),
        agentRoutes: (config.model.auto.agentRoutes ?? defaultAutoAgentRoutes()).map((route) => ({
          ...route,
          candidates: route.candidates.map(normalizeCandidateSpec),
        })),
      },
    },
  };
}

function normalizeCandidateSpec(spec: string): string {
  const separator = spec.indexOf("/");
  if (separator <= 0 || separator >= spec.length - 1) {
    return spec;
  }
  const provider = spec.slice(0, separator);
  const model = spec.slice(separator + 1);
  return `${provider}/${providerModelIdForRequest(provider, model)}`;
}
