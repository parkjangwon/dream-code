import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { agentRunsRoot, parseAgentRunRecord, type AgentRunRecord } from "./agent-run-record.js";

export async function readPersistedAgentRuns(root: string): Promise<readonly AgentRunRecord[]> {
  let entries: readonly string[];
  try {
    entries = await readdir(agentRunsRoot(root));
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const records = await Promise.all(entries.map((entry) => readAgentRunState(root, entry)));
  return records.filter(isAgentRunRecord);
}

export async function readAgentRunState(root: string, runId: string): Promise<AgentRunRecord | undefined> {
  try {
    const parsedJson: unknown = JSON.parse(await readFile(join(agentRunsRoot(root), runId, "state.json"), "utf8"));
    return parseAgentRunRecord(parsedJson);
  } catch (error) {
    if (error instanceof SyntaxError || (isErrnoException(error) && error.code === "ENOENT")) {
      return undefined;
    }
    throw error;
  }
}

function isAgentRunRecord(value: AgentRunRecord | undefined): value is AgentRunRecord {
  return value !== undefined;
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
