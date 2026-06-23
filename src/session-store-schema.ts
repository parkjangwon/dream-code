import { z } from "zod";

export const sessionRoleSchema = z.enum(["user", "assistant"]);

export const sessionTurnSchema = z.object({
  role: sessionRoleSchema,
  content: z.string(),
  createdAt: z.string(),
});

export const sessionStateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  directory: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const sessionIndexEntrySchema = z.object({
  sessionId: z.string().min(1),
  sessionDir: z.string().min(1),
  directory: z.string().min(1),
});

export const wireTurnSchema = z.object({
  type: z.literal("turn"),
  role: sessionRoleSchema,
  content: z.string(),
  createdAt: z.string(),
});

export type SessionIndexEntry = z.infer<typeof sessionIndexEntrySchema>;
export type SessionState = z.infer<typeof sessionStateSchema>;
export type WireTurn = z.infer<typeof wireTurnSchema>;
export type SessionRole = z.infer<typeof sessionRoleSchema>;
export type SessionTurn = z.infer<typeof sessionTurnSchema>;
export type DreamSession = SessionState & { readonly turns: SessionTurn[] };
export type SessionStore = { readonly version: 1; readonly sessions: DreamSession[] };

export class SessionStoreParseError extends Error {
  readonly filePath: string;

  constructor(filePath: string, reason: string) {
    super(`Could not parse Dream Code sessions at ${filePath}: ${reason}`);
    this.name = "SessionStoreParseError";
    this.filePath = filePath;
  }
}

export function parseJsonText<T>(schema: z.ZodType<T>, filePath: string, raw: string): T {
  try {
    const parsedJson: unknown = JSON.parse(raw);
    return parseUnknown(schema, filePath, parsedJson);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new SessionStoreParseError(filePath, error.message);
    }
    throw error;
  }
}

export function parseJsonLine<T>(schema: z.ZodType<T>, filePath: string, line: string): T {
  return parseJsonText(schema, filePath, line);
}

function parseUnknown<T>(schema: z.ZodType<T>, filePath: string, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new SessionStoreParseError(filePath, parsed.error.message);
  }
  return parsed.data;
}
