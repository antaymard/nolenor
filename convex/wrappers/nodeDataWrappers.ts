import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { nodeTypeValidator } from "../schemas/nodeTypeSchema";

import * as NodeDataModels from "../models/nodeDataModels";

export const create = internalMutation({
  args: {
    type: nodeTypeValidator,
    values: v.record(v.string(), v.any()),
    canvasId: v.id("canvases"),
  },
  returns: v.id("nodeDatas"),
  handler: async (ctx, args) => {
    return NodeDataModels.createNodeData(ctx, args);
  },
});

export const updateValues = internalMutation({
  args: {
    _id: v.id("nodeDatas"),
    values: v.record(v.string(), v.any()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return NodeDataModels.updateValues(ctx, args);
  },
});

export const deleteWithCascade = internalMutation({
  args: { nodeDataId: v.id("nodeDatas") },
  returns: v.null(),
  handler: async (ctx, { nodeDataId }) => {
    await NodeDataModels.deleteNodeDataWithCascade(ctx, { nodeDataId });
    return null;
  },
});

export const readNodeData = internalQuery({
  args: { _id: v.id("nodeDatas") },
  handler: async (ctx, args) => {
    return NodeDataModels.readNodeData(ctx, args);
  },
});
