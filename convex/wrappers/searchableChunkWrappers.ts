import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import * as SearchableChunkModels from "../models/searchableChunkModels";
import { searchableChunksValidator } from "../schemas/searchableChunksSchema";

const chunkInputValidator = v.object(searchableChunksValidator.fields);

export const upsertChunks = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    chunks: v.array(chunkInputValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await SearchableChunkModels.upsertChunks(ctx, args);
    return null;
  },
});

export const deleteByNodeDataId = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await SearchableChunkModels.deleteByNodeDataId(ctx, args);
    return null;
  },
});

export const deleteByCanvasId = internalMutation({
  args: {
    canvasId: v.id("canvases"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await SearchableChunkModels.deleteByCanvasId(ctx, args);
    return null;
  },
});

export const listByNodeDataId = internalQuery({
  args: {
    nodeDataId: v.id("nodeDatas"),
  },
  handler: async (ctx, args) =>
    SearchableChunkModels.listByNodeDataId(ctx, args),
});

export const listPdfPagesByNodeDataId = internalQuery({
  args: {
    nodeDataId: v.id("nodeDatas"),
  },
  returns: v.array(
    v.object({
      order: v.number(),
      text: v.string(),
      page: v.optional(v.number()),
      totalPages: v.optional(v.number()),
      sections: v.array(
        v.object({
          level: v.string(),
          title: v.string(),
        }),
      ),
      hasImages: v.boolean(),
      imageCount: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) =>
    SearchableChunkModels.listPdfPagesByNodeDataId(ctx, args),
});

export const fullTextSearch = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    query: v.string(),
    nodeIds: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    hits: v.array(
      v.object({
        nodeId: v.string(),
        nodeDataId: v.id("nodeDatas"),
        nodeType: v.string(),
        chunkType: v.union(
          v.literal("node"),
          v.literal("page"),
          v.literal("annotation"),
        ),
        order: v.number(),
        text: v.string(),
        title: v.optional(v.string()),
        page: v.optional(v.number()),
        sectionTitle: v.optional(v.string()),
      }),
    ),
    scanned: v.number(),
    limit: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => SearchableChunkModels.fullTextSearch(ctx, args),
});
