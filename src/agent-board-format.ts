export function formatAgentAge(startedAt: string, endedAt: string | undefined): string {
  const start = Date.parse(startedAt);
  const end = endedAt === undefined ? Date.now() : Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "0.0s";
  }
  return `${(Math.max(0, end - start) / 1000).toFixed(1)}s`;
}

export function oneLinePreview(text: string): string {
  return text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0).join(" ");
}

export function readableAgentOutputPreview(text: string): string {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isTransientOutputLine(line))
    .slice(-3)
    .join(" ");
}

export function truncatePreview(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 3))}...`;
}

function isTransientOutputLine(line: string): boolean {
  return line.includes(" Thinking ") || line.startsWith("Thinking ") || line.startsWith("◆ Tool ");
}
