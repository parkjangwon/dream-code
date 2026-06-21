import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { Script, createContext } from "node:vm";

export type WorkflowAgentOptions = {
  readonly name?: string;
  readonly model?: "low" | "mid" | "high" | "inherit";
};

export type WorkflowAgentRunner = (
  prompt: string,
  options: WorkflowAgentOptions,
) => Promise<unknown>;

export type WorkflowRuntime = {
  readonly agent: (prompt: string, options?: WorkflowAgentOptions) => Promise<unknown>;
  readonly parallel: (tasks: readonly WorkflowTask[]) => Promise<readonly unknown[]>;
  readonly pipeline: (value: unknown, ...stages: readonly WorkflowStage[]) => Promise<unknown>;
  readonly readFile: (path: string) => Promise<string | null>;
  readonly writeFile: (path: string, content: string) => Promise<boolean>;
  readonly glob: (pattern: string) => Promise<readonly string[]>;
};

export type WorkflowTask = () => unknown | Promise<unknown>;
export type WorkflowStage = (value: unknown) => unknown | Promise<unknown>;

export type WorkflowRunEvent = {
  readonly type: "agent" | "parallel" | "pipeline" | "readFile" | "writeFile" | "glob";
  readonly label: string;
  readonly status: "started" | "done" | "failed";
  readonly elapsedMs: number;
  readonly error?: string;
};

export type RunWorkflowScriptInput = {
  readonly root: string;
  readonly workspace: string;
  readonly script: string;
  readonly runAgent: WorkflowAgentRunner;
  readonly timeoutMs?: number;
};

export type WorkflowRunResult =
  | { readonly status: "done"; readonly value: unknown; readonly events: readonly WorkflowRunEvent[]; readonly durationMs: number }
  | { readonly status: "failed"; readonly error: string; readonly events: readonly WorkflowRunEvent[]; readonly durationMs: number };

type WorkflowModule = {
  readonly main: (runtime: WorkflowRuntime) => unknown | Promise<unknown>;
};

export async function runWorkflowScript(input: RunWorkflowScriptInput): Promise<WorkflowRunResult> {
  const startedAt = Date.now();
  const events: WorkflowRunEvent[] = [];
  try {
    const module = loadWorkflowModule(input.script);
    const runtime = createWorkflowRuntime(input.workspace, input.runAgent, events);
    const value = await withTimeout(Promise.resolve(module.main(runtime)), input.timeoutMs ?? 120_000);
    return { status: "done", value: normalizeWorkflowValue(value), events, durationMs: Date.now() - startedAt };
  } catch (error) {
    return { status: "failed", error: errorMessage(error), events, durationMs: Date.now() - startedAt };
  }
}

function loadWorkflowModule(script: string): WorkflowModule {
  const context = createContext({
    console: { log: () => undefined, error: () => undefined },
    Date,
    JSON,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
  });
  const value: unknown = new Script(wrapModule(script), { filename: "dream-workflow.js" }).runInContext(context, { timeout: 1_000 });
  if (!isWorkflowModule(value)) {
    throw new Error("Workflow must export default async function main(runtime).");
  }
  return value;
}

function createWorkflowRuntime(workspace: string, runAgent: WorkflowAgentRunner, events: WorkflowRunEvent[]): WorkflowRuntime {
  return {
    agent: async (prompt, options = {}) => traceWorkflowStep(events, "agent", options.name ?? prompt, () => runAgent(prompt, options)),
    parallel: async (tasks) => traceWorkflowStep(events, "parallel", `${tasks.length} tasks`, () => Promise.all(tasks.map((task) => task()))),
    pipeline: async (value, ...stages) => traceWorkflowStep(events, "pipeline", `${stages.length} stages`, () => runPipeline(value, stages)),
    readFile: async (path) => traceWorkflowStep(events, "readFile", path, async () => {
      const filePath = workspacePath(workspace, path);
      if (filePath === undefined) {
        return null;
      }
      try {
        return await readFile(filePath, "utf8");
      } catch (error) {
        if (isErrnoException(error) && error.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    }),
    writeFile: async (path, content) => traceWorkflowStep(events, "writeFile", path, async () => {
      const filePath = workspacePath(workspace, path);
      if (filePath === undefined) {
        return false;
      }
      await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
      await writeFile(filePath, content, "utf8");
      return true;
    }),
    glob: async (pattern) => traceWorkflowStep(events, "glob", pattern, () => globWorkspace(workspace, pattern)),
  };
}

async function traceWorkflowStep<T>(
  events: WorkflowRunEvent[],
  type: WorkflowRunEvent["type"],
  label: string,
  task: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  events.push({ type, label: singleLine(label), status: "started", elapsedMs: 0 });
  try {
    const value = await task();
    events.push({ type, label: singleLine(label), status: "done", elapsedMs: Date.now() - startedAt });
    return value;
  } catch (error) {
    events.push({ type, label: singleLine(label), status: "failed", elapsedMs: Date.now() - startedAt, error: errorMessage(error) });
    throw error;
  }
}

async function runPipeline(value: unknown, stages: readonly WorkflowStage[]): Promise<unknown> {
  let current = value;
  for (const stage of stages) {
    current = Array.isArray(current)
      ? await Promise.all(current.map((item) => stage(item)))
      : await stage(current);
  }
  return current;
}

function wrapModule(script: string): string {
  const transformed = script
    .replace(/export\s+const\s+meta\s*=/u, "const meta =")
    .replace(/export\s+default\s+async\s+function\s+main/u, "async function main")
    .replace(/export\s+default\s+function\s+main/u, "function main")
    .replace(/export\s+default\s+main\s*;?/u, "");
  return [
    "\"use strict\";",
    transformed,
    "({ main: typeof main === \"undefined\" ? undefined : main });",
  ].join("\n");
}

function isWorkflowModule(value: unknown): value is WorkflowModule {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return typeof property(value, "main") === "function";
}

function property(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

async function globWorkspace(workspace: string, pattern: string): Promise<readonly string[]> {
  const matcher = globMatcher(pattern);
  const paths = await walkWorkspace(workspace, "");
  return paths.filter((path) => matcher.test(path));
}

async function walkWorkspace(workspace: string, relativeDir: string): Promise<readonly string[]> {
  const root = resolve(workspace, relativeDir);
  const entries = await readdir(root, { withFileTypes: true });
  const paths = await Promise.all(entries.map(async (entry) => {
    const child = relativeDir.length === 0 ? entry.name : `${relativeDir}/${entry.name}`;
    return entry.isDirectory() ? walkWorkspace(workspace, child) : [child];
  }));
  return paths.flat().sort();
}

function globMatcher(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/gu, "/");
  const body = normalized
    .split("**").map((part) => part.split("*").map(escapeRegExp).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${body}$`, "u");
}

function workspacePath(workspace: string, path: string): string | undefined {
  if (isAbsolute(path)) {
    return undefined;
  }
  const segments = path.replace(/\\/gu, "/").split("/").filter((part) => part.length > 0 && part !== ".");
  if (segments.some((part) => part === "..")) {
    return undefined;
  }
  const filePath = resolve(workspace, ...segments);
  const rel = relative(workspace, filePath);
  return rel.startsWith("..") || isAbsolute(rel) ? undefined : filePath;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(new Error(`Workflow timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    promise.then(resolvePromise, rejectPromise).finally(() => {
      clearTimeout(timer);
    });
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown workflow failure";
}

function singleLine(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function normalizeWorkflowValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Array.from(value, normalizeWorkflowValue);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeWorkflowValue(entry)]));
  }
  return value;
}

type ErrnoException = Error & { readonly code: string };

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
