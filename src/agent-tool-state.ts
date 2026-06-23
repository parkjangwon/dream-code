import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import type { AgentToolRequest } from "./agent-tool-schema.js";
import { appendTaskRecord, formatTaskLedger, parseTaskStatus, updateTaskStatus } from "./task-ledger.js";

type ArtifactRequest = Extract<AgentToolRequest, { readonly tool: "artifact" }>;
type TaskRequest = Extract<AgentToolRequest, { readonly tool: "task" }>;

export async function runArtifactTool(request: ArtifactRequest, configRoot: string): Promise<{ readonly output: string; readonly changedPath?: string }> {
  switch (request.action) {
    case "write": {
      const name = artifactName(request);
      if (name === undefined || request.content === undefined) {
        throw new Error("artifact write requires path/name and content");
      }
      const path = artifactPath(configRoot, name);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, request.content, "utf8");
      return { output: `artifact wrote ${path}`, changedPath: path };
    }
    case "read": {
      const name = artifactName(request);
      if (name === undefined) {
        throw new Error("artifact read requires path/name");
      }
      const path = artifactPath(configRoot, name);
      return { output: `${path}\n${await readFile(path, "utf8")}` };
    }
    case "list":
      return { output: await listArtifacts(configRoot) };
    case "delete": {
      const name = artifactName(request);
      if (name === undefined) {
        throw new Error("artifact delete requires path/name");
      }
      const path = artifactPath(configRoot, name);
      await rm(path, { force: true });
      return { output: `artifact deleted ${path}`, changedPath: path };
    }
    default:
      return assertNever(request.action);
  }
}

export async function runTaskTool(request: TaskRequest, configRoot: string): Promise<string> {
  switch (request.action) {
    case "add": {
      if (request.label === undefined || request.detail === undefined) {
        return "task add requires label and detail";
      }
      const task = await appendTaskRecord(configRoot, request.label, request.detail);
      return `${task.id} ${task.status} ${task.label}: ${task.detail}`;
    }
    case "update": {
      if (request.id === undefined || request.status === undefined) {
        return "task update requires id and status";
      }
      const status = parseTaskStatus(request.status);
      if (status === undefined) {
        return `unknown task status: ${request.status}`;
      }
      const task = await updateTaskStatus(configRoot, request.id, status);
      return task === undefined ? `task not found: ${request.id}` : `${task.id} ${task.status} ${task.label}: ${task.detail}`;
    }
    case "list":
      return formatTaskLedger(configRoot);
    default:
      return assertNever(request.action);
  }
}

async function listArtifacts(configRoot: string): Promise<string> {
  const root = resolve(configRoot, "artifacts");
  try {
    const files = await collectArtifactFiles(root, root);
    return files.length === 0 ? "no artifacts" : files.join("\n");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return "no artifacts";
    }
    throw error;
  }
}

async function collectArtifactFiles(root: string, directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectArtifactFiles(root, path));
    } else if (entry.isFile()) {
      files.push(relative(root, path));
    }
  }
  return files.sort();
}

function artifactPath(configRoot: string, name: string): string {
  const root = resolve(configRoot, "artifacts");
  const path = resolve(root, name);
  if (path !== root && path.startsWith(`${root}${sep}`)) {
    return path;
  }
  throw new Error(`Artifact path outside artifact root blocked: ${name}`);
}

function artifactName(request: ArtifactRequest): string | undefined {
  return request.path ?? request.name;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected action: ${String(value)}`);
}

type ErrnoException = Error & {
  readonly code?: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error;
}
