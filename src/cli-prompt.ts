import { cwd as currentWorkingDirectory } from "node:process";

import { runAgentPrompt } from "./agent-runner.js";
import type { DreamConfig } from "./config.js";
import { runDreaming, type DreamingResult, type DreamingSummarizer } from "./dreaming.js";
import { appendSessionTurn, startSession } from "./session-store.js";
import { renderTerminalMarkdown } from "./terminal-markdown.js";

export type PromptCommandOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly prompt: string;
  readonly cwd?: string;
  readonly json?: boolean;
  readonly quiet?: boolean;
  readonly summarizer?: DreamingSummarizer;
  readonly write: (text: string) => void;
  readonly writeError: (text: string) => void;
};

export async function runPromptCommand(options: PromptCommandOptions): Promise<void> {
  const activeCwd = options.cwd ?? currentWorkingDirectory();
  const session = await startSession(options.configRoot, activeCwd);
  await appendSessionTurn(options.configRoot, session.id, "user", options.prompt);
  const assistantText = await runAgentPrompt({
    config: options.config,
    configRoot: options.configRoot,
    prompt: options.prompt,
    cwd: activeCwd,
    sessionId: session.id,
    renderResponse: false,
    write: options.quiet === true ? () => {} : options.writeError,
  });
  await appendSessionTurn(options.configRoot, session.id, "assistant", assistantText);
  const dreaming = await runDreaming(options.configRoot, session.id, options.summarizer === undefined ? {} : { summarizer: options.summarizer });
  if (options.json === true) {
    options.write(`${JSON.stringify(promptOutput(session.id, assistantText, dreaming))}\n`);
    return;
  }
  const renderedText = renderTerminalMarkdown(assistantText);
  options.write(renderedText.endsWith("\n") ? renderedText : `${renderedText}\n`);
}

function promptOutput(sessionId: string, response: string, dreaming: DreamingResult): {
  readonly sessionId: string;
  readonly response: string;
  readonly dreaming: DreamingResult;
} {
  return { sessionId, response, dreaming };
}
