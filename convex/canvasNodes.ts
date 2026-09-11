import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import * as CanvasNodeModels from "./models/canvasNodeModels";
import { canvasNodesValidator } from "./schemas/canvasesSchema";

export const add = mutation({
  args: {
    canvasId: v.id("canvases"),
    canvasNodes: v.array(canvasNodesValidator),
  },
  returns: v.boolean(),
  handler: async (ctx, { canvasNodes, canvasId }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    return CanvasNodeModels.addCanvasNodes(ctx, { canvasId, canvasNodes });
  },
});

export const updatePositionOrDimensions = mutation({
  args: {
    canvasId: v.id("canvases"),
    nodeChanges: v.array(v.any()), // NodeChange[] de reactflow
  },
  returns: v.boolean(),
  handler: async (ctx, { canvasId, nodeChanges }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    return CanvasNodeModels.updatePositionOrDimensions(ctx, {
      canvasId,
      nodeChanges,
    });
  },
});

export const updateCanvasNodes = mutation({
  args: {
    canvasId: v.id("canvases"),
    nodeProps: v.array(
      v.object({
        id: v.string(),
        props: v.optional(
          v.object({
            locked: v.optional(v.boolean()),
            hidden: v.optional(v.boolean()),
            zIndex: v.optional(v.number()),
            color: v.optional(v.string()),
            variant: v.optional(v.string()),
          }),
        ),
        data: v.optional(v.any()),
      }),
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, { canvasId, nodeProps }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    return CanvasNodeModels.updateCanvasNodes(ctx, { canvasId, nodeProps });
  },
});

export const remove = mutation({
  args: {
    canvasId: v.id("canvases"),
    nodeCanvasIds: v.array(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, { canvasId, nodeCanvasIds }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    return CanvasNodeModels.removeCanvasNodes(ctx, {
      authUserId,
      canvasId,
      nodeCanvasIds,
    });
  },
});

export const moveToCanvas = mutation({
  args: {
    sourceCanvasId: v.id("canvases"),
    targetCanvasId: v.id("canvases"),
    nodeCanvasIds: v.array(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, { sourceCanvasId, targetCanvasId, nodeCanvasIds }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, sourceCanvasId, authUserId, "editor");
    await requireCanvasAccess(ctx, targetCanvasId, authUserId, "editor");

    return CanvasNodeModels.moveToCanvas(ctx, {
      sourceCanvasId,
      targetCanvasId,
      nodeCanvasIds,
    });
  },
});
