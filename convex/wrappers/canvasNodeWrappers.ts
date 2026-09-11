import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalQuery } from "../_generated/server";
import errors from "../config/errorsConfig";
import * as CanvasNodeModels from "../models/canvasNodeModels";
import * as EdgeModels from "../models/edgeModels";
import * as NodeModels from "../models/nodeModels";

/**
 * Lecteurs canvas node/edge des tools agent (et de l'aide au canvas) :
 * le node isolé avec son nodeData, ou la paire { nodes, edges } complète du
 * canvas, en DTO (`toCanvasNode`/`toCanvasEdge`). Sans auth au bord — ces
 * wrappers ne servent que du code serveur déjà authentifié (le thread agent
 * a validé l'accès canvas en amont).
 */

export const getNodeWithNodeData = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    return CanvasNodeModels.getNodeWithNodeData(ctx, args);
  },
});

export const getCanvasNodesAndEdges = internalQuery({
  args: {
    canvasId: v.id("canvases"),
  },
  handler: async (ctx, args) => {
    const canvas = await ctx.db.get("canvases", args.canvasId);
    if (!canvas) {
      throw new ConvexError(errors.CANVAS_NOT_FOUND);
    }

    const nodes = await NodeModels.listFromCanvas(ctx, {
      canvasId: args.canvasId,
    });
    const edgeDocs = await EdgeModels.listFromCanvas(ctx, {
      canvasId: args.canvasId,
    });

    return {
      nodes: nodes.map(NodeModels.toCanvasNode),
      edges: edgeDocs.map(EdgeModels.toCanvasEdge),
    };
  },
});
