import type { DreamConfig } from "./config.js";
import { defaultConfigRoot } from "./config.js";
import { runDreaming, type DreamingResult } from "./dreaming.js";
import { createLlmDreamingSummarizer } from "./dreaming-summarizer.js";

export async function finishInteractiveSessionDreaming(
  config: DreamConfig,
  options: { readonly configRoot?: string },
  sessionId: string,
  write: (text: string) => void,
): Promise<void> {
  const configRoot = options.configRoot ?? defaultConfigRoot();
  write("\nDreaming...\n");
  try {
    const result = await runDreaming(configRoot, sessionId, {
      summarizer: createLlmDreamingSummarizer(config, configRoot),
    });
    write(formatDreamingResult(result));
  } catch (error) {
    if (error instanceof Error) {
      write(`Dreaming skipped: ${error.message}\n`);
      return;
    }
    throw error;
  }
}

function formatDreamingResult(result: DreamingResult): string {
  if (result.kind === "saved") {
    return result.added === 0
      ? "Dreaming complete: no new durable memories.\n"
      : `Dreaming complete: saved ${result.added} durable ${plural("memory", result.added)}.\n`;
  }
  return "Dreaming complete: no durable memories found.\n";
}

function plural(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}
