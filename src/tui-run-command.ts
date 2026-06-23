import {
  formatAgentRunDiff,
  formatAgentRunResumeContext,
  formatAgentRunShow,
  revertAgentRun,
} from "./agent-run-history.js";

export type RunCommandOptions = {
  readonly configRoot: string;
  readonly rest: string;
  readonly cwd: string;
};

export async function runRunsCommand(options: RunCommandOptions): Promise<string> {
  const args = options.rest.trim().split(/\s+/u).filter(Boolean);
  const action = args[0] ?? "show";
  const runId = args[1] ?? "latest";
  switch (action) {
    case "show":
      return formatAgentRunShow(options.configRoot, runId);
    case "diff":
      return formatAgentRunDiff(options.configRoot, runId, options.cwd);
    case "resume":
      return formatAgentRunResumeContext(options.configRoot, runId);
    case "revert":
      return revertAgentRun(options.configRoot, runId, options.cwd);
    default:
      return "usage: /runs show|diff|resume|revert [run-id|latest]";
  }
}
