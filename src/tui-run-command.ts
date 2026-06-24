import {
  formatAgentRunDiff,
  formatAgentRunResumeContext,
  formatAgentRunShow,
  formatAgentRunShowJson,
  revertAgentRun,
} from "./agent-run-history.js";
import { formatAgentRunResumeJson } from "./agent-run-resume.js";

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
      return args.includes("--json") ? formatAgentRunShowJson(options.configRoot, runId) : formatAgentRunShow(options.configRoot, runId);
    case "diff":
      return formatAgentRunDiff(options.configRoot, runId, options.cwd);
    case "resume":
      if (args.includes("--json")) {
        return formatAgentRunResumeJson(options.configRoot, runId);
      }
      return formatAgentRunResumeContext(options.configRoot, runId);
    case "revert":
      return revertAgentRun(options.configRoot, runId, options.cwd);
    default:
      return "usage: /runs show|diff|resume|revert [run-id|latest]";
  }
}
