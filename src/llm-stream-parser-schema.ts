import { z } from "zod";

export const chatChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({
      content: z.string().nullable().optional(),
      tool_calls: z.array(z.object({
        index: z.number().int().nonnegative().optional(),
        function: z.object({
          name: z.string().optional(),
          arguments: z.string().optional(),
        }).passthrough().optional(),
      }).passthrough()).optional(),
    }).passthrough(),
    finish_reason: z.string().nullable().optional(),
  }).passthrough()),
}).passthrough();

export const responsesChunkSchema = z.object({
  type: z.string().optional(),
  delta: z.string().optional(),
  item: z.object({
    type: z.string().optional(),
    name: z.string().optional(),
    arguments: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();
