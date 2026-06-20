import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { deleteProviderCredential } from "./credentials.js";
import { runAgentPrompt } from "./agent-runner.js";
import { runLspCheck } from "./lsp-check.js";
import {
  compactCurrentSession,
  copyLastAssistantResponse,
  exportCurrentSession,
  formatSessionActionResult,
} from "./session-actions.js";
import type { SessionRuntime } from "./tui-session-commands.js";
import type { Questioner } from "./tui-workspace-commands.js";
import { formatRulesCommand } from "./context-docs.js";
import {
  addWorkspaceDir,
  appendTask,
  appendWorkflowNote,
  formatArtifacts,
  formatSettingsFile,
  formatTasks,
} from "./workspace-state.js";

export type UtilityCommandOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly command: string;
  readonly rest: string;
  readonly questioner: Questioner;
  readonly sessionRuntime?: SessionRuntime | undefined;
  readonly cwd: string;
};

export async function runUtilityCommand(options: UtilityCommandOptions): Promise<boolean> {
  switch (options.command) {
    case "/add-dir":
      output.write(`${await addWorkspaceDir(options.configRoot, await restOrAsk(options.rest, "Directory: ", options.questioner), options.cwd)}\n`);
      return true;
    case "/artifact":
      output.write(`${await formatArtifacts(options.configRoot, options.cwd)}\n`);
      return true;
    case "/btw":
      await runSideQuestion(options);
      return true;
    case "/compact":
      output.write(await formatSessionActionResult(await compactCurrentSession(options.configRoot, currentSessionId(options))));
      return true;
    case "/copy":
      output.write(await formatSessionActionResult(await copyLastAssistantResponse(options.configRoot, currentSessionId(options))));
      return true;
    case "/export":
      output.write(await formatSessionActionResult(await exportCurrentSession(options.configRoot, currentSessionId(options))));
      return true;
    case "/goal":
      await runWorkflowPrompt(options, "Goal mode", "goals.md", "Goal", "Drive this goal to a verifiable outcome. Produce success criteria, risks, and the next concrete action.");
      return true;
    case "/hooks":
      output.write(`${await formatSettingsFile(options.configRoot, "hooks")}\n`);
      return true;
    case "/interview":
      await runInterview(options);
      return true;
    case "/logout":
      output.write(`${await logoutProvider(options.configRoot, options.rest, options.questioner)}\n`);
      return true;
    case "/lsp":
      output.write(`${await runLspCheck(options.cwd)}\n`);
      return true;
    case "/mcp":
      output.write(`${await formatSettingsFile(options.configRoot, "mcp")}\n`);
      return true;
    case "/plan":
      await runWorkflowPrompt(options, "Plan mode", "plans.md", "Plan", "Create a concise implementation plan with ordered tasks, verification steps, and open risks.");
      return true;
    case "/rules":
      output.write(`${await formatRulesCommand(options.configRoot, options.cwd)}\n`);
      return true;
    case "/research":
      await runFramedAgentPrompt(options, "Research", "Research the request with preference for official sources. If live web search is unavailable, identify the exact sources to verify.");
      return true;
    case "/review":
      await runFramedAgentPrompt(options, "Review", "Review the current work for bugs, regressions, missing tests, and UX risks. Findings first.");
      return true;
    case "/tasks":
      output.write(`${await formatTasks(options.configRoot)}\n`);
      return true;
    case "/verify":
      await runFramedAgentPrompt(options, "Verify mode", "Check the likely verification path, tests to run, and failure risks for the current work.");
      return true;
    default:
      return false;
  }
}

async function runSideQuestion(options: UtilityCommandOptions): Promise<void> {
  const prompt = await restOrAsk(options.rest, "Side question: ", options.questioner);
  if (prompt.trim().length === 0) {
    output.write("btw skipped: no question\n");
    return;
  }
  output.write(`${paint("BTW", `${ansi.bold}${ansi.accent}`)} ${paint("side question", ansi.dim)}\n`);
  await runAgentPrompt({ config: options.config, configRoot: options.configRoot, prompt, write: (chunk) => output.write(chunk) });
}

async function runInterview(options: UtilityCommandOptions): Promise<void> {
  const answers = [
    await options.questioner.question("Primary outcome: "),
    await options.questioner.question("Constraints: "),
    await options.questioner.question("Definition of done: "),
  ].map((answer) => answer.trim()).filter((answer) => answer.length > 0);
  if (answers.length === 0) {
    output.write("interview skipped\n");
    return;
  }
  await runFramedAgentPrompt({ ...options, rest: answers.join("\n") }, "Interview", "Turn these interview answers into durable project guidance and a short implementation direction.");
}

async function runFramedAgentPrompt(options: UtilityCommandOptions, title: string, instruction: string): Promise<void> {
  const prompt = await restOrAsk(options.rest, `${title}: `, options.questioner);
  if (prompt.trim().length === 0) {
    output.write(`${title.toLowerCase()} skipped: no prompt\n`);
    return;
  }
  output.write(`${paint(title, `${ansi.bold}${ansi.accent}`)}\n`);
  await runAgentPrompt({
    config: options.config,
    configRoot: options.configRoot,
    prompt: `${instruction}\n\nUser request:\n${prompt}`,
    write: (chunk) => output.write(chunk),
  });
}

async function runWorkflowPrompt(
  options: UtilityCommandOptions,
  title: string,
  fileName: "goals.md" | "plans.md",
  taskLabel: string,
  instruction: string,
): Promise<void> {
  const prompt = await restOrAsk(options.rest, `${title}: `, options.questioner);
  if (prompt.trim().length === 0) {
    output.write(`${title.toLowerCase()} skipped: no prompt\n`);
    return;
  }
  const filePath = await appendWorkflowNote(options.configRoot, fileName, taskLabel, prompt);
  await appendTask(options.configRoot, taskLabel, prompt);
  output.write(`${paint(`${taskLabel.toLowerCase()} saved:`, ansi.green)} ${paint(filePath, ansi.blue)}\n`);
  await runFramedAgentPrompt({ ...options, rest: prompt }, title, instruction);
}

async function logoutProvider(root: string, rest: string, questioner: Questioner): Promise<string> {
  const provider = await restOrAsk(rest, "Provider: ", questioner);
  const providerId = provider.trim();
  if (providerId.length === 0) {
    return "logout skipped: no provider";
  }
  return await deleteProviderCredential(root, providerId) ? `logged out: ${providerId}` : `logout skipped: ${providerId} was not saved`;
}

async function restOrAsk(rest: string, prompt: string, questioner: Questioner): Promise<string> {
  return rest.trim().length > 0 ? rest.trim() : questioner.question(prompt);
}

function currentSessionId(options: UtilityCommandOptions): string {
  return options.sessionRuntime?.currentId() ?? "";
}
