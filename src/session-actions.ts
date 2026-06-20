import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";

import { ansi, paint } from "./ansi.js";
import { defaultConfigRoot } from "./config.js";
import { listSessions, type DreamSession } from "./session-store.js";

const maxCompactChars = 8_000;

export async function compactCurrentSession(root: string, sessionId: string): Promise<string> {
  const session = await currentSession(root, sessionId);
  if (session === undefined) {
    return "compact skipped: no active session";
  }
  const summary = summarizeSession(session);
  const filePath = join(root, "compacts", `${session.id}.md`);
  await mkdir(join(root, "compacts"), { recursive: true, mode: 0o700 });
  await writeFile(filePath, summary, "utf8");
  return `compact saved: ${filePath}`;
}

export async function formatCompactContext(root: string, sessionId: string | undefined): Promise<string> {
  if (sessionId === undefined) {
    return "Session compact: none.";
  }

  const compact = await readOptionalCompact(root, sessionId);
  if (compact === undefined) {
    return "Session compact: none.";
  }

  return ["Session compact:", truncateCompact(compact)].join("\n");
}

export async function maybeAutoCompactSession(root: string, sessionId: string): Promise<void> {
  const session = await currentSession(root, sessionId);
  if (session === undefined || session.turns.length < 40 || session.turns.length % 10 !== 0) {
    return;
  }
  await compactCurrentSession(root, sessionId);
}

export async function exportCurrentSession(root: string, sessionId: string): Promise<string> {
  const session = await currentSession(root, sessionId);
  if (session === undefined) {
    return "export skipped: no active session";
  }
  const filePath = join(root, "exports", `${safeFileName(session.name)}-${timestamp()}.md`);
  await mkdir(join(root, "exports"), { recursive: true, mode: 0o700 });
  await writeFile(filePath, renderSessionMarkdown(session), "utf8");
  return `exported: ${filePath}`;
}

export async function copyLastAssistantResponse(root: string, sessionId: string, offset = 1): Promise<string> {
  const session = await currentSession(root, sessionId);
  const response = [...(session?.turns ?? [])].reverse().filter((turn) => turn.role === "assistant")[offset - 1]?.content;
  if (response === undefined) {
    return "copy skipped: no assistant response";
  }
  return await writeClipboard(response)
    ? "copied last response"
    : "copy unavailable: clipboard command not found";
}

export function summarizeSession(session: DreamSession): string {
  const recent = session.turns.slice(-12);
  const lines = recent.map((turn) => `- ${turn.role}: ${firstLine(turn.content)}`);
  return [
    `# ${session.name}`,
    "",
    `Directory: ${session.directory}`,
    `Updated: ${session.updatedAt}`,
    "",
    "## Compact Summary",
    session.summary,
    "",
    "## Recent Turns",
    ...lines,
    "",
  ].join("\n");
}

export async function formatSessionActionResult(message: string): Promise<string> {
  return `${paint(message, message.includes("skipped") || message.includes("unavailable") ? ansi.yellow : ansi.green)}\n`;
}

async function currentSession(root: string, sessionId: string): Promise<DreamSession | undefined> {
  return (await listSessions(root)).find((session) => session.id === sessionId);
}

async function readOptionalCompact(root: string, sessionId: string): Promise<string | undefined> {
  try {
    return await readFile(join(root, "compacts", `${sessionId}.md`), "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function renderSessionMarkdown(session: DreamSession): string {
  return [
    `# ${session.name}`,
    "",
    `- Directory: \`${session.directory}\``,
    `- Created: ${session.createdAt}`,
    `- Updated: ${session.updatedAt}`,
    "",
    ...session.turns.flatMap((turn) => [`## ${turn.role}`, "", turn.content, ""]),
  ].join("\n");
}

function writeClipboard(text: string): Promise<boolean> {
  const command = clipboardCommand();
  if (command === undefined) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const child = spawn(command.name, command.args);
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
    child.stdin.end(text);
  });
}

function clipboardCommand(): { readonly name: string; readonly args: readonly string[] } | undefined {
  switch (process.platform) {
    case "darwin":
      return { name: "pbcopy", args: [] };
    case "win32":
      return { name: "clip.exe", args: [] };
    default:
      return process.env["PREFIX"]?.includes("com.termux") === true
        ? { name: "termux-clipboard-set", args: [] }
        : { name: "wl-copy", args: [] };
  }
}

function safeFileName(name: string): string {
  const base = basename(name).toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-|-$/gu, "");
  return base.length === 0 ? "dream-session" : base;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/gu, "").replace(/\..+$/u, "Z");
}

function firstLine(text: string): string {
  const line = text.replace(/\s+/gu, " ").trim();
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

function truncateCompact(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > maxCompactChars ? `${trimmed.slice(0, maxCompactChars)}\n[Truncated compact context]` : trimmed;
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

export function defaultSessionActionRoot(): string {
  return defaultConfigRoot();
}
