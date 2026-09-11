import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import * as CanvasEdgeModels from "./models/canvasEdgeModels";
import { edgesValidator } from "./schemas/canvasesSchema";

export const add = mutation({
  args: {
    canvasId: v.id("canvases"),
    edges: v.array(edgesValidator),
  },
  returns: v.boolean(),
  handler: async (ctx, { edges, canvasId }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    return CanvasEdgeModels.addCanvasEdges(ctx, { canvasId, edges });
  },
});

export const update = mutation({
  args: {
    canvasId: v.id("canvases"),
    edgeUpdates: v.array(
      v.object({
        id: v.string(),
        data: v.optional(v.record(v.string(), v.any())),
      }),
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, { canvasId, edgeUpdates }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    return CanvasEdgeModels.updateCanvasEdges(ctx, { canvasId, edgeUpdates });
  },
});

export const remove = mutation({
  args: {
    canvasId: v.id("canvases"),
    edgeIds: v.array(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, { canvasId, edgeIds }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    return CanvasEdgeModels.removeCanvasEdges(ctx, { canvasId, edgeIds });
  },
});
