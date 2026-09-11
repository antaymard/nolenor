import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import * as NodeModels from "./models/nodeModels";
import { nodesValidator } from "./schemas/nodesSchema";

export const createWithNodeData = mutation({
  args: {
    node: nodesValidator.omit("id", "nodeDataId", "status"),
    nodeDataValues: v.record(v.string(), v.any()),
    nodeDataTemplateId: v.optional(v.id("nodeTemplates")),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, args.node.canvasId, authUserId, "editor");

    // Même orchestrateur que le wrapper interne de l'agent
    // (`nodeWrappers.createWithNodeData`) : les deux voies partagent
    // au niveau Models, comme d'habitude (le public ne passe jamais par
    // un wrapper, il appelle les Models directement).
    const { nodeId } = await NodeModels.createNodeWithData(ctx, {
      node: args.node,
      values: args.nodeDataValues,
      templateId: args.nodeDataTemplateId,
      actor: { type: "user", userId: authUserId },
    });
    return nodeId;
  },
});

export const trash = mutation({
  args: {
    nodeId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    const node = await NodeModels.getNodeOrThrow(ctx, {
      nodeId: args.nodeId,
    });
    await requireCanvasAccess(ctx, node.canvasId, authUserId, "editor");

    return NodeModels.trashNode(ctx, { nodeId: args.nodeId });
  },
});
