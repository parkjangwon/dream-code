import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { cwd as currentWorkingDirectory } from "node:process";
import { basename, extname, join } from "node:path";

export type SkillSource = "dream" | "agents" | "claude";

export type DreamSkill = {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly path: string;
  readonly source: SkillSource;
};

type ErrnoException = Error & { readonly code?: string };

type SkillDocument = {
  readonly metadata: SkillMetadata;
  readonly body: string;
};

type SkillMetadata = {
  readonly name?: string;
  readonly description?: string;
};

export function defaultSkillRoots(home = homedir(), cwd = currentWorkingDirectory()): readonly string[] {
  return [
    join(home, ".dream", "skills"),
    join(home, ".agents", "skills"),
    join(home, ".claude", "skills"),
    join(cwd, ".claude", "skills"),
  ];
}

export async function loadSkills(roots: readonly string[] = defaultSkillRoots()): Promise<readonly DreamSkill[]> {
  const grouped = await Promise.all(roots.map((root) => loadSkillsFromRoot(root)));
  const byName = new Map<string, DreamSkill>();
  for (const skill of grouped.flat()) {
    if (!byName.has(skill.name)) {
      byName.set(skill.name, skill);
    }
  }
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function loadSkillsFromRoot(root: string): Promise<readonly DreamSkill[]> {
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const skills: DreamSkill[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skill = await readSkillFile(join(root, entry.name, "SKILL.md"), root, entry.name);
      if (skill !== undefined) {
        skills.push(skill);
      }
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      const skill = await readSkillFile(join(root, entry.name), root, stripMarkdownExtension(entry.name));
      if (skill !== undefined) {
        skills.push(skill);
      }
    }
  }
  return skills;
}

async function readSkillFile(path: string, root: string, fallbackName: string): Promise<DreamSkill | undefined> {
  let raw = "";
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  const document = parseSkillDocument(raw);
  const name = cleanSkillName(document.metadata.name ?? fallbackName);
  return {
    name,
    description: document.metadata.description ?? descriptionFromBody(document.body),
    body: document.body.trim(),
    path,
    source: sourceFromRoot(root),
  };
}

function parseSkillDocument(raw: string): SkillDocument {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    return { metadata: {}, body: raw };
  }

  const normalized = raw.replace(/\r\n/gu, "\n");
  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex < 0) {
    return { metadata: {}, body: raw };
  }

  const frontmatter = normalized.slice(4, closingIndex);
  const body = normalized.slice(closingIndex + "\n---\n".length);
  return { metadata: parseFrontmatter(frontmatter), body };
}

function parseFrontmatter(frontmatter: string): SkillMetadata {
  let name: string | undefined;
  let description: string | undefined;
  for (const line of frontmatter.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = unquoteYamlScalar(line.slice(separator + 1).trim());
    switch (key) {
      case "name":
        name = value;
        break;
      case "description":
        description = value;
        break;
      default:
        break;
    }
  }
  if (name !== undefined && description !== undefined) {
    return { name, description };
  }
  if (name !== undefined) {
    return { name };
  }
  if (description !== undefined) {
    return { description };
  }
  return {};
}

function descriptionFromBody(body: string): string {
  for (const line of body.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.slice(2).trim();
    }
    if (trimmed.length > 0) {
      return trimmed.slice(0, 120);
    }
  }
  return "Dream Code skill.";
}

function cleanSkillName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "skill";
}

function stripMarkdownExtension(fileName: string): string {
  return basename(fileName, extname(fileName));
}

function sourceFromRoot(root: string): SkillSource {
  const parts = root.split(/[\\/]/u);
  if (parts.includes(".agents")) {
    return "agents";
  }
  if (parts.includes(".claude")) {
    return "claude";
  }
  return "dream";
}

function unquoteYamlScalar(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error;
}
