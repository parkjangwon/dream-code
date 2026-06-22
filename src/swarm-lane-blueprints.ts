import type { SwarmIntensity } from "./swarm-intensity.js";

export type LaneBlueprint = {
  readonly key: string;
  readonly title: string;
  readonly agentId: string;
  readonly mission: string;
  readonly keywords: readonly string[];
};

const laneBlueprints = [
  lane("technical-plan", "Technical Plan Lead", "tech-lead", "Split the goal into the safest execution order and call out architectural boundaries.", ["plan", "architecture", "design", "refactor"]),
  lane("implementation-review", "Implementation Reviewer", "code-reviewer", "Inspect the likely implementation path for correctness, regressions, and missing cases.", ["build", "fix", "implement", "code", "runtime"]),
  lane("failure-hunter", "Failure Mode Hunter", "code-reviewer", "Search for edge cases, state bugs, error handling gaps, and brittle assumptions.", ["bug", "failure", "crash", "regression", "test"]),
  lane("verification-strategist", "Verification Strategist", "code-reviewer", "Define the tests, smoke checks, and release checks that prove the work is done.", ["test", "verify", "ci", "release", "pack"]),
  lane("security-boundary", "Security Boundary Auditor", "security-reviewer", "Review permissions, secrets, destructive operations, and supply-chain risk.", ["security", "secret", "permission", "auth", "plugin"]),
  lane("simplicity-scout", "Simplicity Scout", "code-simplifier", "Find the smallest change that removes duplication and avoids unnecessary abstraction.", ["simplify", "cleanup", "refactor", "complexity"]),
  lane("ux-flow", "UX Flow Reviewer", "ux-reviewer", "Review the user flow, empty states, interaction rhythm, and screen density.", ["ui", "ux", "tui", "mobile", "screen"]),
  lane("mobile-terminal", "Mobile Terminal Reviewer", "ux-reviewer", "Check narrow terminal ergonomics, keyboard flow, and mobile readability.", ["mobile", "termux", "android", "keyboard", "terminal"]),
  lane("release-artifact", "Release Artifact Verifier", "tech-lead", "Validate version bumps, release notes, package contents, tags, and installer assumptions.", ["release", "version", "tag", "pack", "install"]),
  lane("docs-guidance", "Docs Guidance Reviewer", "ux-reviewer", "Check README, command help, and user-facing wording for accuracy and brevity.", ["readme", "docs", "help", "release", "command"]),
  lane("compatibility", "Compatibility Checker", "code-reviewer", "Check compatibility with existing commands, tests, plugins, cron, and persisted state.", ["compat", "plugin", "cron", "migration", "state"]),
  lane("performance", "Latency and Token Reviewer", "code-simplifier", "Look for unnecessary work, slow startup paths, token bloat, and avoidable redraws.", ["fast", "slow", "latency", "token", "performance"]),
  lane("integration-surface", "Integration Surface Auditor", "security-reviewer", "Inspect external process, filesystem, network, and tool boundary assumptions.", ["api", "tool", "shell", "network", "filesystem"]),
  lane("context-memory", "Context and Memory Reviewer", "tech-lead", "Check session context, memory handoff, and whether future turns receive the right facts.", ["context", "memory", "session", "agent"]),
  lane("plugin-marketplace", "Plugin Compatibility Reviewer", "code-reviewer", "Review plugin, marketplace, and imported capability behavior for regressions.", ["plugin", "marketplace", "claude", "skill"]),
  lane("final-risk", "Final Risk Reviewer", "security-reviewer", "Take an adversarial pass over the proposed plan and rank the remaining release risks.", ["risk", "audit", "release", "security"]),
] as const satisfies readonly LaneBlueprint[];

const overdriveBlueprints = [
  lane("failure-hunter", "Failure Mode Hunter", "code-reviewer", "Search for edge cases, state bugs, error handling gaps, and brittle assumptions.", ["bug", "failure", "crash", "regression", "test"]),
  lane("security-boundary", "Security Boundary Auditor", "security-reviewer", "Review permissions, secrets, destructive operations, and supply-chain risk.", ["security", "secret", "permission", "auth", "plugin"]),
  lane("contrarian-review", "Contrarian Reviewer", "tech-lead", "Challenge the obvious plan, argue the strongest opposing case, and expose hidden tradeoffs.", ["risk", "architecture", "plan", "decision"]),
  lane("regression-sniper", "Regression Sniper", "code-reviewer", "Hunt for behavior that could quietly break existing commands, persisted state, tests, or release flows.", ["regression", "compat", "state", "release"]),
  lane("verification-strategist", "Verification Strategist", "code-reviewer", "Define the tests, smoke checks, and release checks that prove the work is done.", ["test", "verify", "ci", "release", "pack"]),
  lane("implementation-review", "Implementation Reviewer", "code-reviewer", "Inspect the likely implementation path for correctness, regressions, and missing cases.", ["build", "fix", "implement", "code", "runtime"]),
  lane("performance-skeptic", "Performance Skeptic", "code-simplifier", "Question slow paths, startup cost, token waste, redraw churn, and unnecessary parallel work.", ["fast", "slow", "latency", "token", "performance"]),
  lane("integration-breaker", "Integration Breaker", "security-reviewer", "Attack external process, filesystem, network, plugin, and tool-boundary assumptions.", ["api", "tool", "shell", "network", "filesystem"]),
  lane("ux-friction", "UX Friction Hunter", "ux-reviewer", "Find mobile, keyboard, terminal, and wording friction that makes the feature feel heavier than it is.", ["ui", "ux", "tui", "mobile", "screen"]),
  lane("final-judge", "Final Judge", "tech-lead", "Rank the remaining risks, choose the highest-leverage next action, and reject noisy recommendations.", ["risk", "audit", "release", "decision"]),
] as const satisfies readonly LaneBlueprint[];

export function plannedLaneBlueprints(
  goal: string,
  adaptiveLimit: number,
  exactLanes: number | undefined,
  intensity: SwarmIntensity,
): readonly LaneBlueprint[] {
  const ordered = intensity === "overdrive" ? overdriveBlueprints : orderedBlueprints(goal);
  if (exactLanes !== undefined) {
    return repeatBlueprints(ordered, exactLanes);
  }
  return ordered.slice(0, adaptiveLimit);
}

function orderedBlueprints(goal: string): readonly LaneBlueprint[] {
  const normalizedGoal = goal.toLowerCase();
  return [...laneBlueprints].sort((left, right) => {
    const scoreDelta = blueprintScore(right, normalizedGoal) - blueprintScore(left, normalizedGoal);
    return scoreDelta === 0 ? 0 : scoreDelta;
  });
}

function blueprintScore(blueprint: LaneBlueprint, normalizedGoal: string): number {
  return blueprint.keywords.reduce((score, keyword) => normalizedGoal.includes(keyword) ? score + 1 : score, 0);
}

function repeatBlueprints(blueprints: readonly LaneBlueprint[], count: number): readonly LaneBlueprint[] {
  return Array.from({ length: count }, (_item, index) => {
    const blueprint = blueprints[index % blueprints.length];
    if (blueprint === undefined) {
      throw new Error("Cannot create swarm lanes without lane blueprints.");
    }
    return blueprint;
  });
}

function lane(
  key: string,
  title: string,
  agentId: string,
  mission: string,
  keywords: readonly string[],
): LaneBlueprint {
  return { key, title, agentId, mission, keywords };
}
