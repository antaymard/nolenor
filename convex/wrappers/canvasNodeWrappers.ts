import { v, ConvexError } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import * as CanvasNodeModels from "../models/canvasNodeModels";
import { canvasNodesValidator } from "../schemas/canvasesSchema";
import { nodeDatasValidator } from "../schemas/nodeDatasSchema";
import { readLegacyNodeData } from "../lib/legacyNodeDataReaders";
import errors from "../config/errorsConfig";

export const add = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    canvasNodes: v.array(canvasNodesValidator),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return CanvasNodeModels.addCanvasNodes(ctx, {
      canvasId: args.canvasId,
      canvasNodes: args.canvasNodes,
    });
  },
});

export const updatePositionOrDimensions = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    nodeChanges: v.array(v.any()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return CanvasNodeModels.updatePositionOrDimensions(ctx, {
      canvasId: args.canvasId,
      nodeChanges: args.nodeChanges,
    });
  },
});

export const updateCanvasNodes = internalMutation({
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
  handler: async (ctx, args) => {
    return CanvasNodeModels.updateCanvasNodes(ctx, {
      canvasId: args.canvasId,
      nodeProps: args.nodeProps,
    });
  },
});

export const remove = internalMutation({
  args: {
    authUserId: v.id("users"),
    canvasId: v.id("canvases"),
    nodeCanvasIds: v.array(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return CanvasNodeModels.removeCanvasNodes(ctx, {
      authUserId: args.authUserId,
      canvasId: args.canvasId,
      nodeCanvasIds: args.nodeCanvasIds,
    });
  },
});

export const getNodeWithNodeData = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.string(),
  },
  returns: v.object({
    node: canvasNodesValidator,
    nodeData: nodeDatasValidator.extend({
      _id: v.id("nodeDatas"),
      _creationTime: v.number(),
    }),
  }),
  handler: async (ctx, { canvasId, nodeId }) => {
    const canvas = await ctx.db.get("canvases", canvasId);
    if (!canvas) throw new ConvexError(errors.CANVAS_NOT_FOUND);

    const matches = (canvas.nodes ?? []).filter((node) => node.id === nodeId);
    if (matches.length > 1) {
      throw new ConvexError(`Ambiguous placement for node ${nodeId}.`);
    }
    const node = matches[0];
    if (!node) {
      throw new ConvexError(
        errors.NODE_NOT_FOUND + ` NodeId: ${nodeId} ; CanvasId: ${canvasId}`,
      );
    }
    const nodeData = await readLegacyNodeData(ctx, canvasId, node);
    if (!nodeData) {
      throw new ConvexError(
        errors.NODE_DATA_NOT_FOUND_FOR_NODE +
          ` NodeId: ${nodeId} ; CanvasId: ${canvasId}`,
      );
    }
    return { node, nodeData };
  },
});

export const getCanvasNodesAndEdges = internalQuery({
  args: {
    canvasId: v.id("canvases"),
  },
  handler: async (ctx, args) => {
    const canvas = await ctx.db.get("canvases", args.canvasId);

    if (!canvas) {
      throw new Error("Canvas not found");
    }

    return {
      nodes: canvas.nodes ?? [],
      edges: canvas.edges ?? [],
    };
  },
});
