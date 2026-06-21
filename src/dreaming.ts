import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { z } from "zod";

import { ensureProjectMemory } from "./memory-store.js";
import { listSessions, type DreamSession, type SessionTurn } from "./session-store.js";

const maxTranscriptChars = 60_000;
const maxMemories = 8;

export const dreamMemorySchema = z.object({
  kind: z.enum(["project-truth", "user-preference", "mistake-to-avoid", "workflow-recipe"]),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(800),
});

export const dreamingOutputSchema = z.object({
  memories: z.array(dreamMemorySchema).max(maxMemories),
});

export type DreamMemory = z.infer<typeof dreamMemorySchema>;
export type DreamingInput = {
  readonly sessionId: string;
  readonly title: string;
  readonly directory: string;
  readonly updatedAt: string;
  readonly transcript: string;
};
export type DreamingSummarizer = (input: DreamingInput) => Promise<readonly DreamMemory[]>;
export type DreamingResult =
  | { readonly kind: "skipped"; readonly reason: "missing-session" | "empty-session" | "no-memories" }
  | { readonly kind: "saved"; readonly added: number; readonly skippedDuplicate: number; readonly filePath: string };

export async function runDreaming(
  root: string,
  sessionId: string,
  options: { readonly summarizer?: DreamingSummarizer } = {},
): Promise<DreamingResult> {
  const session = (await listSessions(root)).find((candidate) => candidate.id === sessionId);
  if (session === undefined) {
    return { kind: "skipped", reason: "missing-session" };
  }
  if (session.turns.length === 0) {
    return { kind: "skipped", reason: "empty-session" };
  }

  const input = dreamingInput(session);
  const memories = await summarizeDreams(input, options.summarizer);
  if (memories.length === 0) {
    return { kind: "skipped", reason: "no-memories" };
  }

  const filePath = await ensureProjectMemory(root, session.directory);
  const current = await readFile(filePath, "utf8");
  const additions = memories.filter((memory) => !current.includes(memoryMarker(memory)));
  if (additions.length > 0) {
    await appendFile(filePath, renderDreamingSection(additions), "utf8");
  }
  return { kind: "saved", added: additions.length, skippedDuplicate: memories.length - additions.length, filePath };
}

function dreamingInput(session: DreamSession): DreamingInput {
  return {
    sessionId: session.id,
    title: session.name,
    directory: session.directory,
    updatedAt: session.updatedAt,
    transcript: trimTranscript(renderTranscript(session.turns)),
  };
}

async function summarizeDreams(
  input: DreamingInput,
  summarizer: DreamingSummarizer | undefined,
): Promise<readonly DreamMemory[]> {
  if (summarizer === undefined) {
    return heuristicDreamMemories(input);
  }
  try {
    return normalizeMemories(await summarizer(input));
  } catch (error) {
    if (error instanceof Error) {
      return heuristicDreamMemories(input);
    }
    throw error;
  }
}

function normalizeMemories(memories: readonly DreamMemory[]): readonly DreamMemory[] {
  const seen = new Set<string>();
  const normalized: DreamMemory[] = [];
  for (const memory of memories) {
    const parsed = dreamMemorySchema.safeParse(memory);
    if (!parsed.success) {
      continue;
    }
    const key = memoryKey(parsed.data);
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(parsed.data);
    }
  }
  return normalized.slice(0, maxMemories);
}

function heuristicDreamMemories(input: DreamingInput): readonly DreamMemory[] {
  const transcript = input.transcript.toLowerCase();
  const memories: DreamMemory[] = [];
  if (/release|\uB9B4\uB9AC\uC988|github release|README/iu.test(input.transcript)) {
    memories.push({
      kind: "workflow-recipe",
      title: "Release requests require verification",
      body: "For release requests, update documentation, run tests, bump version files, tag and push, then verify the published release.",
    });
  }
  if (/\uC54C\uC798\uB531\uAE54\uC13C|\uAC1C\uB5A1|proactive|infer/iu.test(input.transcript)) {
    memories.push({
      kind: "user-preference",
      title: "Infer recurring intent proactively",
      body: "When the user's phrasing is rough but the recurring workflow is clear, infer the expected steps and complete them without unnecessary clarification.",
    });
  }
  if (/same mistake|\uAC19\uC740 \uC2E4\uC218|\uB2E4\uC74C\uC5D0\uB294/iu.test(transcript)) {
    memories.push({
      kind: "mistake-to-avoid",
      title: "Avoid repeating called-out mistakes",
      body: "When the user flags a repeated mistake, preserve the correction as durable memory and apply it before asking for confirmation.",
    });
  }
  return normalizeMemories(memories);
}

function renderTranscript(turns: readonly SessionTurn[]): string {
  return turns.map((turn) => `${turn.role.toUpperCase()}:\n${turn.content.trim()}`).join("\n\n");
}

function trimTranscript(transcript: string): string {
  return transcript.length > maxTranscriptChars
    ? `${transcript.slice(-maxTranscriptChars)}\n[Earlier transcript truncated]`
    : transcript;
}

function renderDreamingSection(memories: readonly DreamMemory[]): string {
  return [
    "",
    `## Dreaming ${new Date().toISOString()}`,
    "",
    ...memories.flatMap((memory) => [
      memoryMarker(memory),
      `- ${memory.kind}: ${memory.title}`,
      `  ${memory.body}`,
    ]),
    "",
  ].join("\n");
}

function memoryMarker(memory: DreamMemory): string {
  return `<!-- dream-memory:${memoryKey(memory)} -->`;
}

function memoryKey(memory: DreamMemory): string {
  return createHash("sha256")
    .update(`${memory.kind}\n${memory.title.trim().toLowerCase()}\n${memory.body.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
}
