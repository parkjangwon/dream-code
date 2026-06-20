import { ansi, paint } from "./ansi.js";

export function formatSwarmHeader(agentCount: number, forced: boolean): string {
  const mode = forced ? "forced overdrive" : "adaptive fan-out";
  return [
    `${paint("✹ Dream Swarm", ansi.accent)} ${paint(`${agentCount} parallel agents`, ansi.bold)}`,
    paint(`Kimi-style ${mode} · token mixing on · synthesis pass enabled`, ansi.guide),
  ].join("\n").concat("\n");
}

export function formatSwarmSynthesis(synthesis: string, totalElapsedMs: number): string {
  const body = synthesis.trim().length === 0 ? "No synthesis output." : synthesis.trim();
  return [
    `${paint("●", ansi.green)} ${paint("Swarm Synthesis", ansi.bold)}`,
    ...body.split(/\r?\n/u).map((line) => formatSynthesisLine(line, totalElapsedMs)),
    paint("✓ Swarm complete", ansi.guide),
  ].join("\n").concat("\n");
}

export function formatSwarmCancelled(): string {
  return `${paint("✓", ansi.yellow)} ${paint("Swarm stopped", ansi.dim)}\n`;
}

function formatSynthesisLine(line: string, totalElapsedMs: number): string {
  const normalized = replaceDoneElapsed(line, totalElapsedMs);
  const styled = normalized.startsWith("✓ Done ")
    ? paint(normalized, `${ansi.accent}${ansi.bold}`)
    : normalized;
  return `${paint("│", ansi.guide)} ${styled}`;
}

function replaceDoneElapsed(line: string, totalElapsedMs: number): string {
  return line.replace(/^✓ Done \S+/u, `✓ Done ${formatElapsed(totalElapsedMs)}`);
}

function formatElapsed(milliseconds: number): string {
  return milliseconds < 1_000 ? `${Math.max(0, milliseconds)}ms` : `${(milliseconds / 1_000).toFixed(1)}s`;
}
