import { ansi, paint } from "./ansi.js";
import type { SwarmIntensity } from "./swarm-intensity.js";

export function formatSwarmHeader(agentCount: number, forced: boolean, intensity: SwarmIntensity = "standard"): string {
  const overdrive = intensity === "overdrive";
  const mode = headerMode(forced, overdrive);
  const title = overdrive ? "✹ Dream Swarm OVERDRIVE" : "✹ Dream Swarm";
  return [
    `${paint(title, ansi.accent)} ${paint(`${agentCount} parallel lanes`, ansi.bold)}`,
    paint(`${mode} · token mixing on · synthesis pass enabled`, ansi.guide),
  ].join("\n").concat("\n");
}

export function formatSwarmSynthesis(
  synthesis: string,
  totalElapsedMs: number,
  laneOutputCharacters = 0,
): string {
  const bodyLines = synthesisBodyLines(synthesis);
  const outputCharacters = laneOutputCharacters + bodyLines.join("\n").length;
  return [
    `${paint("●", ansi.green)} ${paint("Swarm Synthesis", ansi.bold)}`,
    ...bodyLines.map(formatSynthesisLine),
    `${paint("✓", ansi.green)} ${paint("Done", ansi.dim)} ${paint(formatSwarmStats(totalElapsedMs, outputCharacters), ansi.guide)}`,
  ].join("\n").concat("\n");
}

export function formatSwarmCancelled(): string {
  return `${paint("✓", ansi.yellow)} ${paint("Swarm stopped", ansi.dim)}\n`;
}

function synthesisBodyLines(synthesis: string): readonly string[] {
  const lines = synthesis.trim().length === 0 ? ["No synthesis output."] : synthesis.trim().split(/\r?\n/u);
  const lastLine = lines.at(-1);
  return lastLine !== undefined && /^✓ Done \S+/u.test(lastLine) ? lines.slice(0, -1) : lines;
}

function formatSynthesisLine(line: string): string {
  return `${paint("│", ansi.guide)} ${line}`;
}

function formatSwarmStats(totalElapsedMs: number, characterCount: number): string {
  return `${formatElapsed(totalElapsedMs)} · ~${estimateTokens(characterCount)} tokens`;
}

function formatElapsed(milliseconds: number): string {
  return milliseconds < 1_000 ? `${Math.max(0, milliseconds)}ms` : `${(milliseconds / 1_000).toFixed(1)}s`;
}

function estimateTokens(characterCount: number): number {
  return Math.max(0, Math.ceil(characterCount / 4));
}

function headerMode(forced: boolean, overdrive: boolean): string {
  if (overdrive) {
    return forced ? "Dream exact-lane overdrive · adversarial review on" : "Dream overdrive · adversarial review on";
  }
  return forced ? "Dream exact-lane overdrive" : "Dream adaptive fan-out";
}
