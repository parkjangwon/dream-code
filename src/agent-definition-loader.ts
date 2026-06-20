import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import {
  agentDirectory,
  agentLocations,
  defaultAgentTemplates,
  type AgentDefinition,
  type AgentSource,
  type AgentTemplate,
} from "./agent-library.js";

type AgentDocument = {
  readonly metadata: AgentMetadata;
  readonly body: string;
};

type AgentMetadata = {
  readonly name?: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly model?: string;
  readonly tools?: string;
};

type ErrnoException = Error & { readonly code?: string };

export async function loadAgentDefinitions(
  configRoot: string,
  cwd: string,
): Promise<readonly AgentDefinition[]> {
  const project = await loadAgentsFromDirectory(agentDirectory(configRoot, cwd, agentLocations.project), "project");
  const personal = await loadAgentsFromDirectory(agentDirectory(configRoot, cwd, agentLocations.personal), "personal");
  const builtIn = defaultAgentTemplates().map(agentDefinitionFromTemplate);
  const byId = new Map<string, AgentDefinition>();

  for (const agent of [...project, ...personal, ...builtIn]) {
    if (!byId.has(agent.id)) {
      byId.set(agent.id, agent);
    }
  }

  return [...byId.values()].sort(compareAgents);
}

function agentDefinitionFromTemplate(template: AgentTemplate): AgentDefinition {
  return { ...template, source: "built-in" };
}

async function loadAgentsFromDirectory(
  directory: string,
  source: Exclude<AgentSource, "built-in">,
): Promise<readonly AgentDefinition[]> {
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const agents: AgentDefinition[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".md") {
      continue;
    }
    const filePath = join(directory, entry.name);
    const agent = await readAgentFile(filePath, source, stripMarkdownExtension(entry.name));
    if (agent !== undefined) {
      agents.push(agent);
    }
  }
  return agents;
}

async function readAgentFile(
  filePath: string,
  source: Exclude<AgentSource, "built-in">,
  fallbackId: string,
): Promise<AgentDefinition | undefined> {
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  const document = parseAgentDocument(raw);
  const id = slugifyAgentName(document.metadata.name ?? fallbackId);
  return {
    id,
    name: document.metadata.displayName ?? titleFromId(id),
    summary: document.metadata.description ?? firstBodyLine(document.body),
    model: document.metadata.model ?? "inherit",
    tools: parseTools(document.metadata.tools),
    prompt: document.body.trim(),
    source,
    path: filePath,
  };
}

function parseAgentDocument(raw: string): AgentDocument {
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
  return { metadata: parseAgentMetadata(frontmatter), body };
}

function parseAgentMetadata(frontmatter: string): AgentMetadata {
  const metadata: Record<string, string> = {};
  for (const line of frontmatter.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }
    metadata[line.slice(0, separator).trim()] = unquoteYamlScalar(line.slice(separator + 1).trim());
  }
  return {
    ...optionalField("name", metadata["name"]),
    ...optionalField("displayName", metadata["displayName"]),
    ...optionalField("description", metadata["description"]),
    ...optionalField("model", metadata["model"]),
    ...optionalField("tools", metadata["tools"]),
  };
}

function optionalField<K extends keyof AgentMetadata>(key: K, value: string | undefined): Pick<AgentMetadata, K> | {} {
  return value === undefined ? {} : { [key]: value };
}

function parseTools(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim().length === 0) {
    return ["read"];
  }
  return value.split(",").map((tool) => tool.trim()).filter((tool) => tool.length > 0);
}

function firstBodyLine(body: string): string {
  for (const line of body.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed.slice(0, 120);
    }
  }
  return "Dream Code agent.";
}

function titleFromId(id: string): string {
  return id.split(/[-_]+/u).filter((part) => part.length > 0).map(capitalize).join(" ") || "Agent";
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function compareAgents(left: AgentDefinition, right: AgentDefinition): number {
  return sourceRank(left.source) - sourceRank(right.source) || left.name.localeCompare(right.name);
}

function sourceRank(source: AgentSource): number {
  switch (source) {
    case "project":
      return 0;
    case "personal":
      return 1;
    case "built-in":
      return 2;
    default:
      return assertNever(source);
  }
}

function slugifyAgentName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "agent";
}

function stripMarkdownExtension(fileName: string): string {
  return basename(fileName, extname(fileName));
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

function assertNever(value: never): never {
  throw new Error(`Unexpected agent source: ${String(value)}`);
}
