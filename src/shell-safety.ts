const riskyPatterns = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-rf|-fr)\b/u,
  /\bgit\s+reset\s+--hard\b/u,
  /\bgit\s+clean\s+-[a-zA-Z]*f/u,
  /\bdd\s+.*\bof=/u,
  /\bmkfs(?:\.[a-z0-9]+)?\b/u,
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
