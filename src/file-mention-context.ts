import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

export type MentionedReference = {
  readonly label: string;
  readonly path: string;
  readonly content: string;
};

export type LoadMentionedReferencesOptions = {
  readonly cwd: string;
  readonly workspaceDirs?: readonly string[];
};

type MentionSpec = {
  readonly raw: string;
  readonly path: string;
  readonly startLine?: number;
  readonly endLine?: number;
};

const maxFileChars = 20_000;
const maxDirectoryEntries = 200;
const ignoredDirectories = new Set([".git", "node_modules", "dist", ".dream"]);

export async function loadMentionedReferences(
  prompt: string,
  options: LoadMentionedReferencesOptions,
): Promise<readonly MentionedReference[]> {
  const specs = mentionSpecs(prompt);
  const references: MentionedReference[] = [];
  const seenPaths = new Set<string>();
  for (const spec of specs) {
    const resolved = resolveMentionPath(spec.path, options);
    if (resolved === undefined || seenPaths.has(referenceKey(resolved, spec))) {
      continue;
    }
    const reference = await loadReference(spec, resolved);
    if (reference !== undefined) {
      references.push(reference);
      seenPaths.add(referenceKey(resolved, spec));
    }
  }
  return references;
}

export function formatMentionedReferencesForPrompt(references: readonly MentionedReference[]): string {
  if (references.length === 0) {
    return "Referenced files and directories: none.";
  }
  return [
    "Referenced files and directories:",
    ...references.map((reference) => [
      `# ${reference.label} (${reference.path})`,
      reference.content,
    ].join("\n")),
  ].join("\n\n");
}

function mentionSpecs(prompt: string): readonly MentionSpec[] {
  return [...prompt.matchAll(/(^|\s)@([^\s]+)/gu)]
    .map((match) => parseMentionToken(stripTrailingPunctuation(match[2] ?? "")))
    .filter(isMentionSpec);
}

function parseMentionToken(token: string): MentionSpec | undefined {
  if (token.length === 0 || token.includes(":")) {
    return undefined;
  }
  const lineMatch = /^(.*)#(\d+)(?:-(\d+))?$/u.exec(token);
  if (lineMatch === null) {
    return { raw: token, path: token };
  }
  const path = lineMatch[1] ?? "";
  const startLine = positiveInteger(lineMatch[2]);
  if (path.length === 0 || startLine === undefined) {
    return undefined;
  }
  return { raw: token, path, startLine, endLine: positiveInteger(lineMatch[3]) ?? startLine };
}

function stripTrailingPunctuation(token: string): string {
  return token.replace(/[),.;\]}]+$/u, "");
}

function resolveMentionPath(path: string, options: LoadMentionedReferencesOptions): string | undefined {
  const expanded = path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
  const resolved = isAbsolute(expanded) ? resolve(expanded) : resolve(options.cwd, expanded);
  const allowedRoots = [options.cwd, ...(options.workspaceDirs ?? [])].map((root) => resolve(root));
  return allowedRoots.some((root) => isInside(root, resolved)) ? resolved : undefined;
}

function isInside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path.length === 0 || (!path.startsWith("..") && !isAbsolute(path));
}

async function loadReference(spec: MentionSpec, path: string): Promise<MentionedReference | undefined> {
  try {
    const stats = await stat(path);
    if (stats.isDirectory()) {
      return {
        label: `@${spec.raw}`,
        path,
        content: await directoryListing(path),
      };
    }
    if (stats.isFile()) {
      return {
        label: `@${spec.raw}`,
        path,
        content: await fileContent(path, spec),
      };
    }
    return undefined;
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function fileContent(path: string, spec: MentionSpec): Promise<string> {
  const content = await readFile(path, "utf8");
  const selected = selectLines(content, spec);
  return selected.length > maxFileChars
    ? `${selected.slice(0, maxFileChars)}\n[Truncated by Dream Code @mention token saving]`
    : selected;
}

function selectLines(content: string, spec: MentionSpec): string {
  if (spec.startLine === undefined) {
    return content.trimEnd();
  }
  const lines = content.split(/\r?\n/u);
  const start = Math.max(1, spec.startLine);
  const end = Math.max(start, spec.endLine ?? start);
  return lines.slice(start - 1, end).join("\n").trimEnd();
}

async function directoryListing(path: string): Promise<string> {
  const entries: string[] = [];
  await collectDirectoryEntries(path, "", entries);
  return entries.length === 0 ? "(empty directory)" : entries.join("\n");
}

async function collectDirectoryEntries(root: string, directory: string, entries: string[]): Promise<void> {
  if (entries.length >= maxDirectoryEntries) {
    return;
  }
  const current = directory.length === 0 ? root : join(root, directory);
  const children = await readdir(current, { withFileTypes: true });
  for (const child of children) {
    if (entries.length >= maxDirectoryEntries) {
      entries.push("[listing truncated]");
      return;
    }
    const childPath = directory.length === 0 ? child.name : join(directory, child.name);
    if (child.isDirectory()) {
      if (!ignoredDirectories.has(child.name)) {
        entries.push(`- ${childPath}/`);
        await collectDirectoryEntries(root, childPath, entries);
      }
      continue;
    }
    if (child.isFile()) {
      entries.push(`- ${childPath} (${basename(childPath)})`);
    }
  }
}

function referenceKey(path: string, spec: MentionSpec): string {
  return `${path}#${spec.startLine ?? ""}-${spec.endLine ?? ""}`;
}

function positiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isMentionSpec(value: MentionSpec | undefined): value is MentionSpec {
  return value !== undefined;
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
