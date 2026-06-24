import type { DreamConfig } from "./config.js";
import { loadUnhealthyModelKeys } from "./model-telemetry.js";
import { formatRoutePreview, selectModelCandidatesForPrompt, type SelectModelOptions } from "./model-routing.js";
import { routeDiagnostics } from "./model-routing-diagnostics.js";

export type RoutePreviewCommandOptions = {
  readonly configRoot: string;
  readonly config: DreamConfig;
  readonly rest: readonly string[];
};

export async function runRoutePreviewCommand(options: RoutePreviewCommandOptions): Promise<string> {
  const json = options.rest.includes("--json");
  const prompt = options.rest.filter((arg) => arg !== "--json").join(" ").trim() || "Implement a production change";
  const providers = connectedProviders(options.config);
  const routingOptions: SelectModelOptions = {
    ...(providers === undefined ? {} : { connectedProviders: providers }),
    unhealthyModels: await loadUnhealthyModelKeys(options.configRoot),
  };
  if (!json) {
    return `${formatRoutePreview(options.config.model, prompt, routingOptions)}\n`;
  }
  const candidates = selectModelCandidatesForPrompt({ ...options.config.model, mode: "auto" }, prompt, undefined, routingOptions);
  const selected = candidates[0];
  const report = {
    title: "Dream Route Preview",
    prompt,
    selected,
    diagnostics: selected === undefined ? undefined : routeDiagnostics(selected),
    fallbacks: candidates.slice(1, 4),
    skipped: selected?.skipped ?? [],
  };
  return `${JSON.stringify(report, undefined, 2)}\n`;
}

function connectedProviders(config: DreamConfig): ReadonlySet<string> | undefined {
  const enabled = Object.entries(config.providers)
    .filter((entry) => entry[1].enabled)
    .map((entry) => entry[0]);
  return enabled.length === 0 ? undefined : new Set(enabled);
}
