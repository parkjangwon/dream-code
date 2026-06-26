export function sentenceFromText(text: string): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  const withoutCommand = normalized.startsWith("/") ? normalized.slice(1) : normalized;
  const firstSentence = /.+?[.!?。！？](?:\s|$)/u.exec(withoutCommand)?.[0].trim() ?? withoutCommand;
  return firstSentence.length > 90 ? `${firstSentence.slice(0, 87)}...` : firstSentence;
}

export function createSessionId(now: string): string {
  const safeTime = now.replace(/[^0-9A-Za-z]/gu, "");
  return `session_${safeTime}_${Math.random().toString(36).slice(2, 8)}`;
}

export type ErrnoException = Error & {
  readonly code: string;
};

export function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
