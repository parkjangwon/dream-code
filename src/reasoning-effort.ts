import type { ProviderProtocol } from "./provider-registry.js";

export const reasoningEfforts = ["auto", "none", "minimal", "low", "medium", "high", "xhigh"] as const;
export type ReasoningEffort = typeof reasoningEfforts[number];

export type ReasoningConfig = {
  readonly effort: ReasoningEffort;
};

export const defaultReasoningConfig: ReasoningConfig = { effort: "auto" };

export function parseReasoningEffort(input: string): ReasoningEffort | undefined {
  const normalized = input.trim().toLowerCase();
  if (normalized === "off" || normalized === "default") {
    return "auto";
  }
  if (normalized === "med") {
    return "medium";
  }
  if (normalized === "x" || normalized === "x-high" || normalized === "x_high") {
    return "xhigh";
  }
  return isReasoningEffort(normalized) ? normalized : undefined;
}

export function resolveReasoningEffort(
  provider: string,
  protocol: ProviderProtocol,
  model: string,
  effort: ReasoningEffort | undefined,
): Exclude<ReasoningEffort, "auto"> | undefined {
  if (effort === undefined || effort === "auto") {
    return undefined;
  }
  if (!providerSupportsReasoning(provider, protocol, model)) {
    return undefined;
  }
  return supportedEffortsForOpenAiModel(model).includes(effort) ? effort : undefined;
}

export function formatReasoningEffort(effort: ReasoningEffort | undefined): string {
  return effort === undefined ? "auto" : effort;
}

function providerSupportsReasoning(provider: string, protocol: ProviderProtocol, model: string): boolean {
  return provider === "openai"
    && protocol === "responses"
    && openAiReasoningModel(model);
}

function supportedEffortsForOpenAiModel(model: string): readonly Exclude<ReasoningEffort, "auto">[] {
  const normalized = model.toLowerCase();
  if (normalized.includes("gpt-5-pro")) {
    return ["high"];
  }
  if (supportsGptFiveOneOrNewer(normalized)) {
    return supportsXHigh(normalized)
      ? ["none", "minimal", "low", "medium", "high", "xhigh"]
      : ["none", "minimal", "low", "medium", "high"];
  }
  if (normalized.startsWith("gpt-5") || /^o\d/u.test(normalized)) {
    return ["minimal", "low", "medium", "high"];
  }
  return [];
}

function openAiReasoningModel(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.startsWith("gpt-5") || /^o\d/u.test(normalized);
}

function supportsGptFiveOneOrNewer(model: string): boolean {
  if (model.startsWith("gpt-5.1")) {
    return true;
  }
  const version = /^gpt-5\.(\d+)/u.exec(model);
  const minor = version?.[1];
  return minor !== undefined && Number.parseInt(minor, 10) >= 1;
}

function supportsXHigh(model: string): boolean {
  if (model.includes("codex-max") || model.includes("codex")) {
    return true;
  }
  const version = /^gpt-5\.(\d+)/u.exec(model);
  const minor = version?.[1];
  return minor !== undefined && Number.parseInt(minor, 10) >= 2;
}

function isReasoningEffort(value: string): value is ReasoningEffort {
  return reasoningEfforts.some((effort) => effort === value);
}
