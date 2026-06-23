import type { SelectedModel } from "./model-routing.js";

export function formatModelRoutingContext(selectedModels: readonly SelectedModel[]): string {
  if (selectedModels.length === 0) {
    return "Model routing context: no candidate model selected; preserve the full transcript if routing recovers.";
  }
  const [primary, ...fallbacks] = selectedModels;
  return [
    "Model routing context:",
    "AUTO routing may move this exact task across provider/model candidates. Treat the full transcript, session compact, memory, referenced files, and tool results as shared authoritative context.",
    primary === undefined ? "- primary: none" : `- primary: ${formatSelectedModel(primary)}`,
    fallbacks.length === 0 ? "- fallbacks: none" : `- fallbacks: ${fallbacks.map(formatSelectedModel).join(" -> ")}`,
    "If you receive this after a failover, continue the same task from the provided transcript; do not restart, invent missing state, or ignore prior tool results.",
  ].join("\n");
}

function formatSelectedModel(selected: SelectedModel): string {
  const labels = [
    `tier=${selected.tier}`,
    selected.category === undefined ? undefined : `category=${selected.category}`,
    selected.agent === undefined ? undefined : `agent=${selected.agent}`,
    `reason=${selected.reason}`,
  ].filter(isString);
  return `${selected.provider}/${selected.model} (${labels.join(", ")})`;
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}
