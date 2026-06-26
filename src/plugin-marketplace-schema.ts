import { z } from "zod";

export const marketplaceSourceObjectSchema = z.object({
  source: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  ref: z.string().min(1).optional(),
  sha: z.string().min(1).optional(),
}).passthrough();

export const marketplacePluginSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  source: z.union([z.string().min(1), marketplaceSourceObjectSchema]),
}).passthrough();

export const marketplaceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  plugins: z.array(marketplacePluginSchema),
}).passthrough();

export const marketplaceRecordSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  ref: z.string().min(1).optional(),
  addedAt: z.string().min(1),
});

export const marketplaceRegistrySchema = z.object({
  version: z.literal(1),
  marketplaces: z.array(marketplaceRecordSchema),
});
