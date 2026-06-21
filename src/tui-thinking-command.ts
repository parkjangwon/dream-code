import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import { saveConfig, type DreamConfig } from "./config.js";
import { formatReasoningEffort, parseReasoningEffort } from "./reasoning-effort.js";

export type ConfigureThinkingOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly args: string;
};

export async function configureThinking(options: ConfigureThinkingOptions): Promise<DreamConfig> {
  const input = options.args.trim();
  if (input.length === 0 || input === "status") {
    output.write(formatThinkingStatus(options.config));
    return options.config;
  }

  const effort = parseReasoningEffort(input);
  if (effort === undefined) {
    output.write(`${paint("thinking unchanged:", ansi.yellow)} use auto, none, minimal, low, medium, high, or xhigh\n`);
    return options.config;
  }

  const nextConfig: DreamConfig = {
    ...options.config,
    model: {
      ...options.config.model,
      reasoning: { effort },
    },
  };
  await saveConfig(options.configRoot, nextConfig);
  output.write(`${paint("thinking set:", ansi.green)} ${formatReasoningEffort(effort)}\n`);
  if (effort !== "auto") {
    output.write(`${paint("capability:", ansi.dim)} applied only when the selected provider/model supports reasoning effort\n`);
  }
  return nextConfig;
}

function formatThinkingStatus(config: DreamConfig): string {
  return `${paint("thinking:", ansi.green)} ${formatReasoningEffort(config.model.reasoning?.effort)}\n`;
}
