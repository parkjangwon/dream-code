const riskyPatterns = [
  /(?:^|[;&|]\s*)rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-rf|-fr)\b/u,
  /(?:^|[;&|]\s*)git\s+reset\s+--hard\b/u,
  /(?:^|[;&|]\s*)git\s+clean\s+-[a-zA-Z]*f/u,
  /(?:^|[;&|]\s*)dd\s+.*\bof=/u,
  /(?:^|[;&|]\s*)mkfs(?:\.[a-z0-9]+)?\b/u,
] as const;

export function riskyShellReason(command: string): string | undefined {
  const normalized = command.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  return riskyPatterns.some((pattern) => pattern.test(normalized))
    ? "destructive shell pattern detected"
    : undefined;
}
