import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { optionalAuth, requireAuth, requireCanvasAccess } from "./lib/auth";
import errors from "./config/errorsConfig";
import * as EdgeModels from "./models/edgeModels";
import {
  edgeCreateItemValidator,
  edgePatchUpdateValidator,
  edgesValidator,
} from "./schemas/edgesSchema";

const edgeDocValidator = v.object({
  _id: v.id("edges"),
  _creationTime: v.number(),
  ...edgesValidator.fields,
});

async function requireEditorOnEdgesCanvas(
  ctx: Parameters<typeof requireCanvasAccess>[0],
  authUserId: Id<"users">,
  edgeIds: Array<string>,
) {
  if (edgeIds.length === 0) return;
  const edges = await Promise.all(
    edgeIds.map((edgeId) => EdgeModels.getEdgeOrThrow(ctx, { edgeId })),
  );
  const canvasId = edges[0].canvasId;
  for (const edge of edges) {
    if (edge.canvasId !== canvasId) {
      throw new ConvexError(errors.EDGES_MUST_SHARE_CANVAS);
    }
  }
  await requireCanvasAccess(ctx, canvasId, authUserId, "editor");
}

export const create = mutation({
  args: {
    edges: v.array(edgeCreateItemValidator),
  },
  returns: v.array(v.object({ edgeId: v.string() })),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    if (args.edges.length === 0) return [];

    const canvasId = args.edges[0].canvasId;
    for (const edge of args.edges) {
      if (edge.canvasId !== canvasId) {
        throw new ConvexError(errors.EDGES_MUST_SHARE_CANVAS);
      }
    }
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    const edgeIds = await EdgeModels.createEdges(ctx, { edges: args.edges });
    return edgeIds.map((edgeId) => ({ edgeId }));
  },
});

export const patch = mutation({
  args: {
    updates: v.array(edgePatchUpdateValidator),
    touchCanvas: v.optional(v.boolean()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await requireEditorOnEdgesCanvas(
      ctx,
      authUserId,
      args.updates.map((update) => update.edgeId),
    );

    return EdgeModels.patchEdges(ctx, {
      updates: args.updates,
      touchCanvas: args.touchCanvas,
    });
  },
});

export const trash = mutation({
  args: {
    edgeIds: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await requireEditorOnEdgesCanvas(ctx, authUserId, args.edgeIds);

    return EdgeModels.trashEdges(ctx, { edgeIds: args.edgeIds });
  },
});

/**
 * Sortie de corbeille. Retourne les llmIds RÉELLEMENT remis en service : une
 * edge dont une extrémité dort encore à la corbeille est écartée en silence
 * (cf. `EdgeModels.untrashEdge`), elle n'a nulle part où s'accrocher.
 */
export const untrash = mutation({
  args: {
    edgeIds: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await requireEditorOnEdgesCanvas(ctx, authUserId, args.edgeIds);

    return EdgeModels.untrashEdges(ctx, { edgeIds: args.edgeIds });
  },
});

/** Pendant de `nodes.purgeTrashed` pour les edges. Cf. convex/crons.ts. */
export const purgeTrashed = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const hasMore = await EdgeModels.purgeTrashedBatch(ctx);
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.edges.purgeTrashed, {});
    }
    return null;
  },
});

export const listFromCanvas = query({
  args: {
    canvasId: v.id("canvases"),
  },
  returns: v.array(edgeDocValidator),
  handler: async (ctx, args) => {
    const authUserId = await optionalAuth(ctx);
    await requireCanvasAccess(ctx, args.canvasId, authUserId, "viewer", {
      allowPublic: true,
    });

    return EdgeModels.listFromCanvas(ctx, { canvasId: args.canvasId });
  },
});
