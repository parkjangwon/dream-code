import { z } from "zod";

export const toolNameSchema = z.enum(["read", "research", "shell", "write", "edit", "mcp"]);
const toolRequestBaseSchema = z.object({ id: z.string().min(1).optional() });

const readRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("read"), path: z.string().min(1) });
const researchRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("research"), query: z.string().min(1) });
const shellRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("shell"), command: z.string().min(1) });
const writeRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("write"), path: z.string().min(1), content: z.string() });
const editRequestSchema = toolRequestBaseSchema.extend({
  tool: z.literal("edit"),
  path: z.string().min(1),
  search: z.string().min(1),
  replace: z.string(),
});
const mcpRequestSchema = toolRequestBaseSchema.extend({
  tool: z.literal("mcp"),
  server: z.string().min(1),
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

export const toolRequestSchema = z.discriminatedUnion("tool", [
  readRequestSchema,
  researchRequestSchema,
  shellRequestSchema,
  writeRequestSchema,
  editRequestSchema,
  mcpRequestSchema,
]);

export type AgentToolName = z.infer<typeof toolNameSchema>;
export type AgentToolRequest = z.infer<typeof toolRequestSchema>;
