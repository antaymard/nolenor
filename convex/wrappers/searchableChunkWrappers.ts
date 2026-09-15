import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery } from "../_generated/server";
import * as SearchableChunkModels from "../models/searchableChunkModels";
import {
  fusedHitValidator,
  searchableChunksValidator,
} from "../schemas/searchableChunksSchema";
import { nodeTypeValidator } from "../schemas/nodeTypeSchema";
import { requireAuth, requireCanvasAccess } from "../lib/auth";
import { EMBEDDING_MODEL_TAG } from "../lib/voyage";

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
    nodeTypes: v.optional(v.array(nodeTypeValidator)),
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
    relaxed: v.boolean(),
    terms: v.array(v.string()),
  }),
  handler: async (ctx, args) => SearchableChunkModels.fullTextSearch(ctx, args),
});

/** Garde d'accès canvas pour les actions (pas de `ctx.db` en action). */
export const checkCanvasAccess = internalQuery({
  args: { canvasId: v.id("canvases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, args.canvasId, userId);
    return null;
  },
});

/**
 * Hydrate des hits `ctx.vectorSearch` (`{_id, _score}`) en documents projetés.
 * Couche fine : toute la logique vit dans `SearchableChunkModels`.
 */
export const hydrateVectorHits = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    hits: v.array(v.object({ id: v.id("searchableChunks"), score: v.number() })),
    nodeIds: v.optional(v.array(v.string())),
    nodeTypes: v.optional(v.array(nodeTypeValidator)),
    agentReadableOnly: v.optional(v.boolean()),
  },
  // `sources` est ajouté par l'appelant (`semanticCore`), pas par l'hydratation.
  returns: v.array(
    v.object({
      ...fusedHitValidator.fields,
      sources: v.optional(fusedHitValidator.fields.sources),
    }),
  ),
  handler: async (ctx, args) =>
    SearchableChunkModels.hydrateVectorHits(ctx, args),
});

// ── Backfill embeddings (migration) ────────────────────────────────────────

export const listChunkPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchableChunks")
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((chunk) => ({
        _id: chunk._id,
        title: chunk.title,
        text: chunk.text,
        needsEmbedding: chunk.embeddingModel !== EMBEDDING_MODEL_TAG,
      })),
    };
  },
});

export const patchChunkEmbeddings = internalMutation({
  args: {
    items: v.array(
      v.object({
        id: v.id("searchableChunks"),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const item of args.items) {
      await ctx.db.patch(item.id, {
        embedding: item.embedding,
        embeddingModel: EMBEDDING_MODEL_TAG,
      });
    }
    return null;
  },
});
