import { z } from "zod";

export const toolNameSchema = z.enum(["read", "list", "search", "grep", "glob", "research", "shell", "write", "edit", "delete", "mkdir", "mcp"]);
const toolRequestBaseSchema = z.object({ id: z.string().min(1).optional() });

const lineRangeSchema = {
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
} as const;

const readRequestSchema = toolRequestBaseSchema.extend({
  tool: z.literal("read"),
  path: z.string().min(1),
  ...lineRangeSchema,
});
const listRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("list"), path: z.string().min(1).optional() });
const searchRequestSchema = toolRequestBaseSchema.extend({
  tool: z.literal("search"),
  query: z.string().min(1),
  path: z.string().min(1).optional(),
});
const grepRequestSchema = toolRequestBaseSchema.extend({
  tool: z.literal("grep"),
  query: z.string().min(1),
  path: z.string().min(1).optional(),
  regex: z.boolean().optional(),
  glob: z.string().min(1).optional(),
  caseSensitive: z.boolean().optional(),
  contextLines: z.number().int().min(0).max(10).optional(),
});
const globRequestSchema = toolRequestBaseSchema.extend({
  tool: z.literal("glob"),
  pattern: z.string().min(1),
  path: z.string().min(1).optional(),
  maxResults: z.number().int().positive().max(500).optional(),
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
  replaceAll: z.boolean().optional(),
  expectedReplacements: z.number().int().min(0).optional(),
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
  grepRequestSchema,
  globRequestSchema,
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
