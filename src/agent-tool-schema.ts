import { z } from "zod";

export const toolNameSchema = z.enum([
  "read",
  "list",
  "search",
  "grep",
  "glob",
  "research",
  "fetch",
  "diff",
  "stat",
  "diagnostics",
  "shell",
  "write",
  "edit",
  "patch",
  "delete",
  "mkdir",
  "move",
  "copy",
  "artifact",
  "task",
  "mcp",
]);
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
const fetchRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("fetch"), url: z.string().url(), maxChars: z.number().int().positive().max(50_000).optional() });
const diffRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("diff"), path: z.string().min(1).optional(), maxChars: z.number().int().positive().max(50_000).optional() });
const statRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("stat"), path: z.string().min(1) });
const diagnosticsRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("diagnostics") });
const shellRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("shell"), command: z.string().min(1) });
const writeRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("write"), path: z.string().min(1), content: z.string() });
const deleteRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("delete"), path: z.string().min(1) });
const mkdirRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("mkdir"), path: z.string().min(1) });
const moveRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("move"), from: z.string().min(1), to: z.string().min(1), overwrite: z.boolean().optional() });
const copyRequestSchema = toolRequestBaseSchema.extend({ tool: z.literal("copy"), from: z.string().min(1), to: z.string().min(1), overwrite: z.boolean().optional() });
const editRequestSchema = toolRequestBaseSchema.extend({
  tool: z.literal("edit"),
  path: z.string().min(1),
  search: z.string().min(1),
  replace: z.string(),
  replaceAll: z.boolean().optional(),
  expectedReplacements: z.number().int().min(0).optional(),
});
const patchRequestSchema = toolRequestBaseSchema.extend({
  tool: z.literal("patch"),
  patch: z.string().min(1),
});
const artifactRequestSchema = toolRequestBaseSchema.extend({
  tool: z.literal("artifact"),
  action: z.enum(["write", "read", "list", "delete"]),
  path: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  content: z.string().optional(),
});
const taskRequestSchema = toolRequestBaseSchema.extend({
  tool: z.literal("task"),
  action: z.enum(["add", "update", "list"]),
  label: z.string().min(1).optional(),
  detail: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  status: z.enum(["todo", "doing", "done", "blocked"]).optional(),
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
  fetchRequestSchema,
  diffRequestSchema,
  statRequestSchema,
  diagnosticsRequestSchema,
  shellRequestSchema,
  writeRequestSchema,
  deleteRequestSchema,
  mkdirRequestSchema,
  moveRequestSchema,
  copyRequestSchema,
  editRequestSchema,
  patchRequestSchema,
  artifactRequestSchema,
  taskRequestSchema,
  mcpRequestSchema,
]);

export type AgentToolName = z.infer<typeof toolNameSchema>;
export type AgentToolRequest = z.infer<typeof toolRequestSchema>;
