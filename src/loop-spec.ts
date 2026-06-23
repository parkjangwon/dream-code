import { z } from "zod";

const commandEvaluatorSchema = z.object({
  type: z.literal("command"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  passExitCodes: z.array(z.number().int().min(0)).default([0]),
  timeoutMs: z.number().int().positive().max(30 * 60 * 1_000).default(120_000),
});

const loopSpecSchema = z.object({
  version: z.literal(1).default(1),
  name: z.string().min(1),
  goal: z.string().min(1),
  prompt: z.string().min(1).optional(),
  maxTurns: z.number().int().min(1).max(50).default(3),
  evaluator: commandEvaluatorSchema,
});

export type LoopSpec = z.infer<typeof loopSpecSchema>;
export type LoopEvaluatorSpec = LoopSpec["evaluator"];

export class LoopSpecParseError extends Error {
  constructor(readonly reason: string) {
    super(`Could not parse loop spec: ${reason}`);
    this.name = "LoopSpecParseError";
  }
}

export function parseLoopSpec(raw: string): LoopSpec {
  const parsedJson = parseJson(raw);
  const parsed = loopSpecSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new LoopSpecParseError(parsed.error.message);
  }
  return parsed.data;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new LoopSpecParseError(error.message);
    }
    throw error;
  }
}
