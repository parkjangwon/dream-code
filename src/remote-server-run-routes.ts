import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

import {
  formatAgentRunDiff,
  formatAgentRunResumeContext,
  readAgentRunRecord,
  revertAgentRunChanges,
} from "./agent-run-store.js";
import type { RemoteCommandBroker } from "./remote-command-broker.js";
import { readJson, sendJson } from "./remote-http.js";
import { resolveRemoteCommandCwd } from "./remote-server-command-routes.js";

const continueRunRequestSchema = z.object({
  cwd: z.string().optional(),
  prompt: z.string().optional(),
});

export async function handleRemoteRunResource(
  root: string,
  workspaceRoot: string,
  broker: RemoteCommandBroker,
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const parsed = parseRunPath(pathname);
  if (parsed === undefined) {
    return false;
  }
  switch (parsed.action) {
    case "review":
      await handleRunReview(root, parsed.runId, response);
      return true;
    case "restore":
      await handleRunRestore(root, parsed.runId, request, response);
      return true;
    case "continue":
      await handleRunContinue(root, workspaceRoot, broker, parsed.runId, request, response);
      return true;
    default:
      return assertNever(parsed.action);
  }
}

async function handleRunReview(root: string, runId: string, response: ServerResponse): Promise<void> {
  const run = await readAgentRunRecord(root, runId);
  if (run === undefined) {
    sendJson(response, 404, { error: "Run not found." });
    return;
  }
  sendJson(response, 200, {
    run,
    diff: await formatAgentRunDiff(root, run.id),
  });
}

async function handleRunRestore(root: string, runId: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const result = await revertAgentRunChanges(root, runId);
    sendJson(response, 200, { ok: true, ...result });
  } catch (error) {
    if (error instanceof Error) {
      sendJson(response, 404, { error: error.message });
      return;
    }
    throw error;
  }
}

async function handleRunContinue(
  root: string,
  workspaceRoot: string,
  broker: RemoteCommandBroker,
  runId: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }
  const parsed = continueRunRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    sendJson(response, 400, { error: "Invalid continue request." });
    return;
  }
  const run = await readAgentRunRecord(root, runId);
  if (run === undefined) {
    sendJson(response, 404, { error: "Run not found." });
    return;
  }
  const cwdResult = await resolveRemoteCommandCwd(root, workspaceRoot, parsed.data.cwd ?? run.checkpoints[0]?.workspaceRoot, undefined);
  if (!cwdResult.ok) {
    sendJson(response, 400, { error: cwdResult.message });
    return;
  }
  const resumeContext = await formatAgentRunResumeContext(root, run.id);
  const prompt = [resumeContext, parsed.data.prompt?.trim()].filter(isNonEmptyString).join("\n\nContinue request: ");
  const command = broker.submit({ prompt, cwd: cwdResult.cwd });
  sendJson(response, 202, { command });
}

type RunAction = "review" | "restore" | "continue";

function parseRunPath(pathname: string): { readonly runId: string; readonly action: RunAction } | undefined {
  const match = /^\/api\/runs\/([^/]+)\/(review|restore|continue)$/u.exec(pathname);
  if (match === null) {
    return undefined;
  }
  const runId = match[1];
  const action = match[2];
  if (runId === undefined || !isRunAction(action)) {
    return undefined;
  }
  return { runId: decodeURIComponent(runId), action };
}

function isRunAction(value: string | undefined): value is RunAction {
  return value === "review" || value === "restore" || value === "continue";
}

function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected run action: ${String(value)}`);
}
