import { z } from "zod";

export const toolNameSchema = z.enum(["read", "list", "search", "research", "shell", "write", "edit", "delete", "mkdir", "mcp"]);
const toolRequestBaseSchema = z.object({ id: z.string().min(1).optional() });

const readRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("read"), path: z.string().min(1) });
const listRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("list"), path: z.string().min(1).optional() });
const searchRequestSchema = toolRequestBaseSchema.extend({
  tool: z.literal("search"),
  query: z.string().min(1),
  path: z.string().min(1).optional(),
});
const researchRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("research"), query: z.string().min(1) });
const shellRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("shell"), command: z.string().min(1) });
const writeRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("write"), path: z.string().min(1), content: z.string() });
const deleteRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("delete"), path: z.string().min(1) });
const mkdirRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("mkdir"), path: z.string().min(1) });
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
  listRequestSchema,
  searchRequestSchema,
  researchRequestSchema,
  shellRequestSchema,
  writeRequestSchema,
  deleteRequestSchema,
  mkdirRequestSchema,
  editRequestSchema,
  mcpRequestSchema,
]);

export type AgentToolName = z.infer<typeof toolNameSchema>;
export type AgentToolRequest = z.infer<typeof toolRequestSchema>;
