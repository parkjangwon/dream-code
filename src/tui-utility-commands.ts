import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { deleteProviderCredential } from "./credentials.js";
import { runAgentPrompt } from "./agent-runner.js";
import { formatHooksStatus } from "./hooks.js";
import { runGoalCommand } from "./tui-goal-command.js";
import { runLspCheck } from "./lsp-check.js";
import { formatMcpRuntimeStatus } from "./mcp-context.js";
import { runResearch } from "./research-tool.js";
import { copyLastAssistantResponse, exportCurrentSession, formatSessionActionResult } from "./session-actions.js";
import { runCompactCommand } from "./tui-compact-command.js";
import type { SessionRuntime } from "./tui-session-commands.js";
import type { Questioner } from "./tui-workspace-commands.js";
import { formatRulesCommand } from "./context-docs.js";
import { runTasksCommand } from "./tui-task-command.js";
import { runWorkflowCommand } from "./tui-workflow-command.js";
import {
  addWorkspaceDir,
  appendProjectWorkflowNote,
  appendTask,
  appendWorkflowNote,
  formatArtifacts,
} from "./workspace-state.js";

export type UtilityCommandOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly command: string;
  readonly rest: string;
  readonly questioner: Questioner;
  readonly sessionRuntime?: SessionRuntime | undefined;
  readonly cwd: string;
  readonly signal?: AbortSignal;
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
      await runCompactCommand({ config: options.config, configRoot: options.configRoot, sessionId: currentSessionId(options) });
      return true;
    case "/copy":
      output.write(await formatSessionActionResult(await copyLastAssistantResponse(options.configRoot, currentSessionId(options), copyOffset(options.rest))));
      return true;
    case "/export":
      output.write(await formatSessionActionResult(await exportCurrentSession(options.configRoot, currentSessionId(options))));
      return true;
    case "/goal":
      await runGoalCommand({
        config: options.config,
        configRoot: options.configRoot,
        rest: options.rest,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      return true;
    case "/hooks":
      output.write(`${await formatHooksStatus(options.configRoot)}\n`);
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
      output.write(`${await formatMcpRuntimeStatus(options.configRoot, options.signal)}\n`);
      return true;
    case "/plan":
      await runWorkflowPrompt(options, "Plan mode", "plans.md", "Plan", "Create a concise implementation plan with ordered tasks, verification steps, and open risks.");
      return true;
    case "/rules":
      output.write(`${await formatRulesCommand(options.configRoot, options.cwd)}\n`);
      return true;
    case "/research":
      await runResearchCommand(options);
      return true;
    case "/review":
      await runFramedAgentPrompt(options, "Review", "Review the current work for bugs, regressions, missing tests, and UX risks. Findings first.");
      return true;
    case "/tasks":
      output.write(await runTasksCommand(options.configRoot, options.rest));
      return true;
    case "/verify":
      await runFramedAgentPrompt(options, "Verify mode", "Check the likely verification path, tests to run, and failure risks for the current work.");
      return true;
    case "/workflow":
      await runWorkflowCommand(options);
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
  await runAgentPrompt({
    config: options.config,
    configRoot: options.configRoot,
    prompt,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    write: (chunk) => output.write(chunk),
  });
}

async function runInterview(options: UtilityCommandOptions): Promise<void> {
  const answers: string[] = [];
  for (const prompt of ["Primary outcome: ", "Constraints: ", "Definition of done: "] as const) {
    const answer = await options.questioner.question(prompt);
    if (options.questioner.wasCancelled?.() === true) {
      return;
    }
    const trimmed = answer.trim();
    if (trimmed.length > 0) {
      answers.push(trimmed);
    }
  }
  if (answers.length === 0) {
    output.write("interview skipped\n");
    return;
  }
  await runFramedAgentPrompt({ ...options, rest: answers.join("\n") }, "Interview", "Turn these interview answers into durable project guidance and a short implementation direction.");
}

async function runResearchCommand(options: UtilityCommandOptions): Promise<void> {
  const query = await restOrAsk(options.rest, "Research: ", options.questioner);
  if (query.trim().length === 0) {
    output.write("research skipped: no query\n");
    return;
  }
  const result = await runResearch(query);
  output.write(`${paint("Research", `${ansi.bold}${ansi.accent}`)} ${result.ok ? paint("ready", ansi.green) : paint("failed", ansi.yellow)}\n`);
  output.write(`${result.output}\n`);
  await runAgentPrompt({
    config: options.config,
    configRoot: options.configRoot,
    prompt: [
      "Research the request with preference for official sources.",
      `User request: ${query}`,
      "Search results:",
      result.output,
    ].join("\n"),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    write: (chunk) => output.write(chunk),
  });
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
    ...(options.signal === undefined ? {} : { signal: options.signal }),
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
  const filePath = fileName === "plans.md"
    ? await appendProjectWorkflowNote(options.cwd, fileName, taskLabel, prompt)
    : await appendWorkflowNote(options.configRoot, fileName, taskLabel, prompt);
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

function copyOffset(rest: string): number {
  const parsed = Number.parseInt(rest.trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
