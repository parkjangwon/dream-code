import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { stdout as output } from "node:process";
import { join, relative, resolve } from "node:path";

import { runAgentPrompt } from "./agent-runner.js";
import { ansi, paint, stripAnsi } from "./ansi.js";
import type { UtilityCommandOptions } from "./tui-utility-commands.js";
import { runWorkflowScript, type WorkflowAgentOptions, type WorkflowRunEvent } from "./workflow-engine.js";
import { saveWorkflowRun } from "./workflow-runs.js";

export async function runWorkflowCommand(options: UtilityCommandOptions): Promise<void> {
  const scriptPath = await workflowScriptPath(options);
  if (scriptPath.trim().length === 0) {
    output.write("workflow skipped: no file\n");
    return;
  }
  const filePath = resolve(options.cwd, scriptPath.trim());
  const script = await readWorkflowScript(filePath);
  if (script === undefined) {
    output.write(`${paint("workflow not found:", ansi.yellow)} ${paint(scriptPath.trim(), ansi.blue)}\n`);
    output.write(`${paint("usage:", ansi.dim)} /workflow ${paint("or", ansi.dim)} /workflow path/to/workflow.js\n`);
    output.write(`${paint("tip:", ansi.dim)} workflows run saved JavaScript recipes. For natural-language planning, use /plan <request>.\n`);
    return;
  }
  output.write(`${paint("Workflow", `${ansi.bold}${ansi.accent}`)} ${paint(filePath, ansi.blue)}\n`);
  const result = await runWorkflowScript({
    root: options.configRoot,
    workspace: options.cwd,
    script,
    runAgent: (prompt, agentOptions) => runWorkflowAgent(options, prompt, agentOptions),
  });
  const runPath = await saveWorkflowRun(options.configRoot, {
    scriptPath: filePath,
    workspace: options.cwd,
    status: result.status,
    durationMs: result.durationMs,
    events: result.events,
    ...(result.status === "done" ? { value: result.value } : { error: result.error }),
  });
  if (result.status === "failed") {
    output.write(`${paint("workflow failed:", ansi.red)} ${result.error}\n`);
    output.write(formatWorkflowTrace(result.events, result.durationMs));
    output.write(`${paint("workflow run:", ansi.dim)} ${paint(runPath, ansi.blue)}\n`);
    return;
  }
  output.write(`${paint("workflow done", ansi.green)} ${paint(formatDuration(result.durationMs), ansi.dim)}\n${renderWorkflowValue(result.value)}\n`);
  output.write(formatWorkflowTrace(result.events, result.durationMs));
  output.write(`${paint("workflow run:", ansi.dim)} ${paint(runPath, ansi.blue)}\n`);
}

async function workflowScriptPath(options: UtilityCommandOptions): Promise<string> {
  if (options.rest.trim().length > 0) {
    return options.rest.trim();
  }
  const choices = await workflowChoices(options.cwd);
  if (choices.length > 0 && options.questioner.select !== undefined) {
    return await options.questioner.select({ title: "Workflows", choices }) ?? "";
  }
  if (choices.length === 0 && options.rest.trim().length === 0) {
    const starterPath = await createStarterWorkflow(options.cwd);
    output.write(`${paint("workflow starter created:", ansi.green)} ${paint(relative(options.cwd, starterPath), ansi.blue)}\n`);
    output.write(`${paint("edit it, then run:", ansi.dim)} /workflow ${relative(options.cwd, starterPath)}\n`);
    return "";
  }
  return options.questioner.question("Workflow file: ");
}

async function workflowChoices(cwd: string): Promise<readonly { readonly value: string; readonly label: string; readonly description: string; readonly keywords: readonly string[] }[]> {
  const files = (await Promise.all([workflowFiles(cwd, ".dream/workflows"), workflowFiles(cwd, "workflows")])).flat();
  return files.map((filePath) => ({
    value: relative(cwd, filePath),
    label: relative(cwd, filePath),
    description: "Project workflow",
    keywords: [filePath, relative(cwd, filePath)],
  }));
}

async function workflowFiles(cwd: string, directory: string): Promise<readonly string[]> {
  const root = join(cwd, directory);
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
      .map((entry) => join(root, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function createStarterWorkflow(cwd: string): Promise<string> {
  const filePath = join(cwd, ".dream", "workflows", "example.js");
  await mkdir(join(cwd, ".dream", "workflows"), { recursive: true, mode: 0o700 });
  try {
    await writeFile(filePath, starterWorkflowSource(), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (isErrnoException(error) && error.code === "EEXIST") {
      return filePath;
    }
    throw error;
  }
  return filePath;
}

function starterWorkflowSource(): string {
  return [
    "export const meta = { name: \"example\", description: \"Inspect the project with parallel agents\" };",
    "",
    "export default async function main({ agent, parallel, glob, readFile }) {",
    "  const files = await glob(\"*.md\");",
    "  const readme = await readFile(\"README.md\");",
    "  const lanes = await parallel([",
    "    () => agent(`Summarize this project from README:\\n${readme ?? \"No README\"}`, { name: \"Project Summarizer\" }),",
    "    () => agent(`Review these top-level markdown files: ${files.join(\", \")}`, { name: \"Docs Reviewer\" }),",
    "  ]);",
    "  return { files, lanes };",
    "}",
    "",
  ].join("\n");
}

async function runWorkflowAgent(options: UtilityCommandOptions, prompt: string, agentOptions: WorkflowAgentOptions): Promise<string> {
  let transcript = "";
  await runAgentPrompt({
    config: options.config,
    configRoot: options.configRoot,
    cwd: options.cwd,
    prompt,
    runLabel: agentOptions.name ?? "Workflow Agent",
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    write: (chunk) => {
      transcript = `${transcript}${stripAnsi(chunk)}`;
      output.write(chunk);
    },
  });
  return transcript.trim();
}

async function readWorkflowScript(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function formatWorkflowTrace(events: readonly WorkflowRunEvent[], durationMs: number): string {
  if (events.length === 0) {
    return `${paint("workflow trace:", ansi.dim)} ${formatDuration(durationMs)} · no runtime steps\n`;
  }
  const done = events.filter((event) => event.status === "done").length;
  const failed = events.filter((event) => event.status === "failed").length;
  const recent = events.filter((event) => event.status !== "started").slice(-6).map(formatEventLine);
  return [
    `${paint("workflow trace:", ansi.dim)} ${done} done · ${failed} failed · ${formatDuration(durationMs)}`,
    ...recent,
    "",
  ].join("\n");
}

function formatEventLine(event: WorkflowRunEvent): string {
  const status = event.status === "failed" ? paint("FAILED", ansi.red) : paint("DONE  ", ansi.green);
  return `${status} ${paint(event.type.padEnd(9), ansi.muted)} ${paint(formatDuration(event.elapsedMs).padStart(7), ansi.dim)} ${event.label}`;
}

function renderWorkflowValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2) ?? "null";
}

function formatDuration(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
