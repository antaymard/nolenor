import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { optionalAuth, requireAuth, requireCanvasAccess } from "./lib/auth";
import errors from "./config/errorsConfig";
import { getNodeDataTitle } from "./lib/getNodeDataTitle";
import * as NodeModels from "./models/nodeModels";
import {
  nodeCreateWithDataItemValidator,
  nodePatchUpdateValidator,
  nodesValidator,
} from "./schemas/nodesSchema";

const createdNodeReturnValidator = v.object({
  nodeId: v.string(),
  nodeDataId: v.id("nodeDatas"),
});

const nodeDocValidator = v.object({
  _id: v.id("nodes"),
  _creationTime: v.number(),
  ...nodesValidator.fields,
});

async function requireEditorOnNodesCanvas(
  ctx: Parameters<typeof requireCanvasAccess>[0],
  authUserId: Id<"users">,
  nodeIds: Array<string>,
) {
  if (nodeIds.length === 0) return;
  const nodes = await Promise.all(
    nodeIds.map((nodeId) => NodeModels.getNodeOrThrow(ctx, { nodeId })),
  );
  const canvasId = nodes[0].canvasId;
  for (const node of nodes) {
    if (node.canvasId !== canvasId) {
      throw new ConvexError(errors.NODES_MUST_SHARE_CANVAS);
    }
  }
  await requireCanvasAccess(ctx, canvasId, authUserId, "editor");
  return canvasId;
}

export const createWithNodeData = mutation({
  args: {
    nodes: v.array(nodeCreateWithDataItemValidator),
  },
  returns: v.array(createdNodeReturnValidator),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    if (args.nodes.length === 0) return [];

    const canvasId = args.nodes[0].node.canvasId;
    for (const item of args.nodes) {
      if (item.node.canvasId !== canvasId) {
        throw new ConvexError(errors.NODES_MUST_SHARE_CANVAS);
      }
    }
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    return NodeModels.createNodesWithData(ctx, {
      nodes: args.nodes.map((item) => ({
        id: item.id,
        node: item.node,
        values: item.nodeDataValues,
        templateId: item.nodeDataTemplateId,
      })),
      actor: { type: "user", userId: authUserId },
    });
  },
});

export const patch = mutation({
  args: {
    updates: v.array(nodePatchUpdateValidator),
    touchCanvas: v.optional(v.boolean()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await requireEditorOnNodesCanvas(
      ctx,
      authUserId,
      args.updates.map((update) => update.nodeId),
    );

    return NodeModels.patchNodes(ctx, {
      updates: args.updates,
      touchCanvas: args.touchCanvas,
    });
  },
});

export const trash = mutation({
  args: {
    nodeIds: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await requireEditorOnNodesCanvas(ctx, authUserId, args.nodeIds);

    return NodeModels.trashNodes(ctx, {
      nodeIds: args.nodeIds,
      actor: { type: "user", userId: authUserId },
    });
  },
});

export const untrash = mutation({
  args: {
    nodeIds: v.array(v.string()),
    // Rendre aussi les connexions parties avec ces nodes. La modale corbeille
    // le demande (elle ne connaît que des nodes) ; l'undo du canvas non — il
    // nomme ses edges lui-même, il les tient de `deleteElements`.
    restoreIncidentEdges: v.optional(v.boolean()),
  },
  returns: v.object({
    nodeIds: v.array(v.string()),
    edgeIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await requireEditorOnNodesCanvas(ctx, authUserId, args.nodeIds);

    return NodeModels.untrashNodes(ctx, args);
  },
});

/**
 * Le contenu de la corbeille d'un canvas. `editor` et pas `viewer` : ce sont
 * des éléments retirés du canvas, seul quelqu'un qui peut les remettre a une
 * raison de les voir.
 */
export const listTrashedFromCanvas = query({
  args: {
    canvasId: v.id("canvases"),
  },
  returns: v.array(
    v.object({
      node: nodeDocValidator,
      title: v.string(),
      // `false` = nodeData déjà détruit par l'ancienne cascade immédiate. La
      // ligne se restaure encore, mais elle reviendra vide : autant le dire.
      hasContent: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, args.canvasId, authUserId, "editor");

    const nodes = await NodeModels.listTrashedFromCanvas(ctx, {
      canvasId: args.canvasId,
    });

    return Promise.all(
      nodes.map(async (node) => {
        const nodeData = await ctx.db.get(node.nodeDataId);
        if (!nodeData) {
          return { node, title: "Deleted content", hasContent: false };
        }
        const template = nodeData.templateId
          ? await ctx.db.get(nodeData.templateId)
          : null;
        return {
          node,
          title: getNodeDataTitle(nodeData, template),
          hasContent: true,
        };
      }),
    );
  },
});

/**
 * Purge de la corbeille, déclenchée par le cron quotidien (convex/crons.ts) et
 * exécutable à la main depuis le dashboard. Se re-schedule tant qu'un lot
 * revient plein — même forme que `nodeDataVersions.pruneExpired`.
 */
export const purgeTrashed = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const hasMore = await NodeModels.purgeTrashedBatch(ctx);
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.nodes.purgeTrashed, {});
    }
    return null;
  },
});

export const move = mutation({
  args: {
    nodeIds: v.array(v.string()),
    targetCanvasId: v.id("canvases"),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    const sourceCanvasId = await requireEditorOnNodesCanvas(
      ctx,
      authUserId,
      args.nodeIds,
    );
    if (sourceCanvasId !== undefined) {
      await requireCanvasAccess(
        ctx,
        args.targetCanvasId,
        authUserId,
        "editor",
      );
    }

    return NodeModels.moveNodes(ctx, {
      nodeIds: args.nodeIds,
      targetCanvasId: args.targetCanvasId,
    });
  },
});

export const listFromCanvas = query({
  args: {
    canvasId: v.id("canvases"),
  },
  returns: v.array(nodeDocValidator),
  handler: async (ctx, args) => {
    const authUserId = await optionalAuth(ctx);
    await requireCanvasAccess(ctx, args.canvasId, authUserId, "viewer", {
      allowPublic: true,
    });

    return NodeModels.listFromCanvas(ctx, { canvasId: args.canvasId });
  },
});
