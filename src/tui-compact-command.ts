import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import { brailleSpinner } from "./braille-ui.js";
import { createLlmCompactSummarizer } from "./compact-summarizer.js";
import type { DreamConfig } from "./config.js";
import { ProviderProtocolError, ProviderRequestError, MissingProviderConfigError } from "./llm-provider.js";
import { compactCurrentSession, formatSessionActionResult } from "./session-actions.js";

export async function runCompactCommand(options: {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly sessionId: string;
}): Promise<void> {
  try {
    output.write(`${paint(brailleSpinner(0), ansi.accent)} ${paint("compacting session context...", ansi.dim)}\n`);
    const result = await compactCurrentSession(options.configRoot, options.sessionId, {
      summarizer: createLlmCompactSummarizer(options.config, options.configRoot),
    });
    output.write(await formatSessionActionResult(result));
  } catch (error) {
    output.write(`${paint("compact failed:", ansi.yellow)} ${compactErrorMessage(error)}\n`);
  }
}

function compactErrorMessage(error: unknown): string {
  if (
    error instanceof MissingProviderConfigError
    || error instanceof ProviderProtocolError
    || error instanceof ProviderRequestError
  ) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown error";
}
