import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const agentLocations = {
  personal: "personal",
  project: "project",
} as const;

export type AgentLocation = typeof agentLocations[keyof typeof agentLocations];

export type AgentTemplate = {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly model: string;
  readonly tools: readonly string[];
  readonly prompt: string;
};

const builtInAgentTemplates = [
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    summary: "Review changes for bugs, regressions, and missing tests.",
    model: "inherit",
    tools: ["read", "shell"],
    prompt: "You are a focused code reviewer. Prioritize correctness, regressions, security risks, and test gaps. Report findings first with file and line references.",
  },
  {
    id: "code-simplifier",
    name: "Code Simplifier",
    summary: "Reduce complexity while preserving behavior.",
    model: "inherit",
    tools: ["read", "edit"],
    prompt: "You simplify code without changing behavior. Prefer small, local refactors, clearer names, and fewer branches. Keep public contracts stable.",
  },
  {
    id: "security-reviewer",
    name: "Security Reviewer",
    summary: "Audit threats, secrets, permissions, and dependency risk.",
    model: "high",
    tools: ["read", "shell", "research"],
    prompt: "You are a security reviewer. Look for injection, auth, secrets, unsafe defaults, supply-chain risk, and dangerous automation. Give practical mitigations.",
  },
  {
    id: "tech-lead",
    name: "Tech Lead",
    summary: "Turn ambiguous goals into staged implementation plans.",
    model: "high",
    tools: ["read", "plan"],
    prompt: "You are a pragmatic tech lead. Clarify goals, split work into safe milestones, identify risks, and keep scope tied to the repository architecture.",
  },
  {
    id: "ux-reviewer",
    name: "UX Reviewer",
    summary: "Review TUI and product flows for clarity and polish.",
    model: "inherit",
    tools: ["read", "research"],
    prompt: "You review user experience with a product designer's eye. Focus on clarity, rhythm, accessibility, empty states, and familiar interaction patterns.",
  },
] as const satisfies readonly AgentTemplate[];

export function defaultAgentTemplates(): readonly AgentTemplate[] {
  return builtInAgentTemplates;
}

export function agentDirectory(configRoot: string, cwd: string, location: AgentLocation): string {
  return location === agentLocations.personal
    ? join(configRoot, "agents")
    : join(cwd, ".dream", "agents");
}

export function agentFilePath(
  configRoot: string,
  cwd: string,
  location: AgentLocation,
  agentId: string,
): string {
  return join(agentDirectory(configRoot, cwd, location), `${agentId}.md`);
}

export async function writeAgentTemplate(
  configRoot: string,
  cwd: string,
  location: AgentLocation,
  template: AgentTemplate,
): Promise<string> {
  const directory = agentDirectory(configRoot, cwd, location);
  await mkdir(directory, { recursive: true });
  const filePath = agentFilePath(configRoot, cwd, location, template.id);
  await writeFile(filePath, renderAgentTemplate(template), "utf8");
  return filePath;
}

export function customAgentTemplate(name: string, summary: string, prompt: string): AgentTemplate {
  const id = slugifyAgentName(name);
  return {
    id,
    name,
    summary,
    model: "inherit",
    tools: ["read", "edit", "shell"],
    prompt,
  };
}

export function renderAgentTemplate(template: AgentTemplate): string {
  return [
    "---",
    `name: ${template.id}`,
    `displayName: ${template.name}`,
    `description: ${template.summary}`,
    `model: ${template.model}`,
    `tools: ${template.tools.join(", ")}`,
    "---",
    "",
    template.prompt,
    "",
  ].join("\n");
}

function slugifyAgentName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "agent";
}
