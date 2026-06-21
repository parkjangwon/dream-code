import { runAgentPrompt } from "./agent-runner.js";
import { stripAnsi } from "./ansi.js";
import type { SwarmAgentRunner, SwarmRunOptions } from "./swarm-runner.js";

export function defaultSwarmAgentRunner(options: SwarmRunOptions): SwarmAgentRunner {
  return async (input) => {
    let transcript = "";
    const assistantText = await runAgentPrompt({
      config: options.config,
      configRoot: options.configRoot,
      cwd: options.cwd,
      prompt: input.prompt,
      agent: input.agent,
      signal: input.signal,
      ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
      runKind: input.kind === "lane" ? "swarm-lane" : "swarm-synthesis",
      runLabel: input.kind === "lane" ? input.lane.title : input.agent.name,
      renderResponse: false,
      write: (chunk) => {
        transcript = `${transcript}${stripAnsi(chunk)}`;
        input.report({ characters: transcript.length, preview: tailPreview(transcript) });
      },
    });
    const output = assistantText.trim();
    input.report({ characters: output.length, preview: tailPreview(output) });
    return output;
  };
}

function tailPreview(text: string): string {
  return text.split(/\r?\n/u).slice(-8).join("\n").trim();
}
