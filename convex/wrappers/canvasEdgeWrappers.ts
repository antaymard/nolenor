import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import * as CanvasEdgeModels from "../models/canvasEdgeModels";
import { edgesValidator } from "../schemas/canvasesSchema";

export const add = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    edges: v.array(edgesValidator),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return CanvasEdgeModels.addCanvasEdges(ctx, {
      canvasId: args.canvasId,
      edges: args.edges,
    });
  },
});

export const update = internalMutation({
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
  handler: async (ctx, args) => {
    return CanvasEdgeModels.updateCanvasEdges(ctx, {
      canvasId: args.canvasId,
      edgeUpdates: args.edgeUpdates,
    });
  },
});

export const remove = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    edgeIds: v.array(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return CanvasEdgeModels.removeCanvasEdges(ctx, {
      canvasId: args.canvasId,
      edgeIds: args.edgeIds,
    });
  },
});
