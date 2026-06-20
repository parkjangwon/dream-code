import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ansi, paint } from "./ansi.js";
import { defaultConfigRoot } from "./config.js";

export type ContextDoc = {
  readonly label: string;
  readonly path: string;
  readonly content: string;
};

export type ContextDocs = {
  readonly rules: readonly ContextDoc[];
  readonly design: readonly ContextDoc[];
};

export type LoadContextDocsOptions = {
  readonly configRoot?: string | undefined;
  readonly cwd: string;
  readonly prompt: string;
};

const maxDocChars = 12_000;

export async function loadContextDocs(options: LoadContextDocsOptions): Promise<ContextDocs> {
  const configRoot = options.configRoot ?? defaultConfigRoot();
  const rules = await readExistingDocs([
    { label: "global AGENTS.md", path: join(configRoot, "AGENTS.md") },
    { label: "project AGENTS.md", path: join(options.cwd, "AGENTS.md") },
  ]);
  const design = shouldLoadDesign(options.prompt)
    ? await readExistingDocs([
      { label: "global DESIGN.md", path: join(configRoot, "DESIGN.md") },
      { label: "project DESIGN.md", path: join(options.cwd, "DESIGN.md") },
    ])
    : [];
  return { rules, design };
}

export function formatContextDocsForPrompt(docs: ContextDocs): string {
  const sections = [
    formatDocSection("Dream Code project rules", docs.rules),
    formatDocSection("Dream Code design system", docs.design),
  ].filter((section) => section.length > 0);
  return sections.length === 0 ? "Dream Code project rules: none discovered." : sections.join("\n\n");
}

export async function formatRulesCommand(configRoot: string, cwd: string, prompt = "ui"): Promise<string> {
  const docs = await loadContextDocs({ configRoot, cwd, prompt });
  return [
    paint("Rules", `${ansi.bold}${ansi.accent}`),
    ...formatCommandDocLines(docs.rules),
    "",
    paint("Design", `${ansi.bold}${ansi.accent}`),
    ...formatCommandDocLines(docs.design),
  ].join("\n");
}

async function readExistingDocs(candidates: readonly Pick<ContextDoc, "label" | "path">[]): Promise<readonly ContextDoc[]> {
  const docs: ContextDoc[] = [];
  for (const candidate of candidates) {
    const content = await readOptionalText(candidate.path);
    if (content !== undefined) {
      docs.push({ ...candidate, content: truncateDoc(content) });
    }
  }
  return docs;
}

async function readOptionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function shouldLoadDesign(prompt: string): boolean {
  return /ui|ux|tui|design|layout|screen|frontend|style|color|theme|\uB514\uC790\uC778|\uD654\uBA74|\uB808\uC774\uC544\uC6C3|\uC0C9\uC0C1|\uD504\uB860\uD2B8/u.test(prompt.toLowerCase());
}

function truncateDoc(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > maxDocChars ? `${trimmed.slice(0, maxDocChars)}\n[Truncated by Dream Code token saving]` : trimmed;
}

function formatDocSection(title: string, docs: readonly ContextDoc[]): string {
  if (docs.length === 0) {
    return "";
  }
  return [
    `${title}:`,
    ...docs.map((doc) => [`# ${doc.label} (${doc.path})`, doc.content].join("\n")),
  ].join("\n");
}

function formatCommandDocLines(docs: readonly ContextDoc[]): readonly string[] {
  if (docs.length === 0) {
    return [paint("No documents discovered.", ansi.dim)];
  }
  return docs.map((doc) => `${paint(doc.label.padEnd(18), ansi.blue)} ${paint(doc.path, ansi.dim)}\n${doc.content}`);
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
