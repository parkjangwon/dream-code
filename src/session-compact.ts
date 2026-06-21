import type { DreamSession } from "./session-store.js";

const maxTranscriptChars = 60_000;

export type SessionCompactInput = {
  readonly title: string;
  readonly directory: string;
  readonly updatedAt: string;
  readonly transcript: string;
};

export type SessionCompactSummarizer = (input: SessionCompactInput) => Promise<string>;

export function sessionCompactInput(session: DreamSession): SessionCompactInput {
  return {
    title: session.summary,
    directory: session.directory,
    updatedAt: session.updatedAt,
    transcript: truncateTranscript(renderTranscript(session)),
  };
}

export async function createSessionCompact(
  session: DreamSession,
  summarizer: SessionCompactSummarizer | undefined,
): Promise<string> {
  const input = sessionCompactInput(session);
  return summarizer === undefined ? deterministicCompact(input) : normalizeCompact(await summarizer(input), input);
}

export function deterministicCompact(input: SessionCompactInput): string {
  return [
    "# Dream Context Compact",
    "",
    "## Objective",
    input.title,
    "",
    "## Workspace",
    `- Directory: ${input.directory}`,
    `- Updated: ${input.updatedAt}`,
    "",
    "## Decisions",
    "- No model-generated decisions recorded yet.",
    "",
    "## Completed Work",
    "- See recent transcript.",
    "",
    "## Open Work",
    "- Continue from the latest user request.",
    "",
    "## Risks",
    "- Compact was generated without an LLM summarizer.",
    "",
    "## Next Actions",
    "- Review the latest turn and proceed.",
    "",
    "## Recent Transcript",
    input.transcript,
    "",
  ].join("\n");
}

function normalizeCompact(compact: string, input: SessionCompactInput): string {
  const trimmed = compact.trim();
  return trimmed.length === 0 ? deterministicCompact(input) : `${trimmed}\n`;
}

function renderTranscript(session: DreamSession): string {
  return session.turns
    .map((turn) => `### ${turn.role} ${turn.createdAt}\n${turn.content.trim()}`)
    .join("\n\n");
}

function truncateTranscript(transcript: string): string {
  if (transcript.length <= maxTranscriptChars) {
    return transcript;
  }
  return `${transcript.slice(0, maxTranscriptChars)}\n[Transcript truncated for compact generation]`;
}
