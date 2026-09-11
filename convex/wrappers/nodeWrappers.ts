import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
} from "../_generated/server";
import * as NodeModels from "../models/nodeModels";
import {
  nodeCreateWithDataItemValidator,
  nodePatchUpdateValidator,
} from "../schemas/nodesSchema";
import { nodeDataVersionActorValidator } from "../schemas/nodeDataVersionsSchema";

const createdNodeReturnValidator = v.object({
  nodeId: v.string(),
  nodeDataId: v.id("nodeDatas"),
});

export const createWithNodeData = internalMutation({
  args: {
    nodes: v.array(nodeCreateWithDataItemValidator),
    actor: v.optional(nodeDataVersionActorValidator),
  },
  returns: v.array(createdNodeReturnValidator),
  handler: async (ctx, args) => {
    return NodeModels.createNodesWithData(ctx, {
      nodes: args.nodes.map((item) => ({
        node: item.node,
        values: item.nodeDataValues,
        templateId: item.nodeDataTemplateId,
      })),
      actor: args.actor,
    });
  },
});

export const patch = internalMutation({
  args: {
    updates: v.array(nodePatchUpdateValidator),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    return NodeModels.patchNodes(ctx, { updates: args.updates });
  },
});

export const trash = internalMutation({
  args: {
    nodeIds: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    return NodeModels.trashNodes(ctx, { nodeIds: args.nodeIds });
  },
});

export const move = internalMutation({
  args: {
    nodeIds: v.array(v.string()),
    targetCanvasId: v.id("canvases"),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    return NodeModels.moveNodes(ctx, {
      nodeIds: args.nodeIds,
      targetCanvasId: args.targetCanvasId,
    });
  },
});

export const read = internalQuery({
  args: {
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    return NodeModels.getNodeOrThrow(ctx, { nodeId: args.nodeId });
  },
});

export const getByNodeDataId = internalQuery({
  args: {
    nodeDataId: v.id("nodeDatas"),
  },
  handler: async (ctx, args) => {
    return NodeModels.getNodeByNodeDataId(ctx, {
      nodeDataId: args.nodeDataId,
    });
  },
});
