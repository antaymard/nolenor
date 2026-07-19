import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { nodeTypeValidator } from "../schemas/nodeTypeSchema";
import { nodeDataVersionActorValidator } from "../schemas/nodeDataVersionsSchema";

import * as NodeDataModels from "../models/nodeDataModels";

export const create = internalMutation({
  args: {
    type: nodeTypeValidator,
    values: v.record(v.string(), v.any()),
    canvasId: v.id("canvases"),
    // Requis pour type === "custom" : lien autoritaire vers le template.
    templateId: v.optional(v.id("nodeTemplates")),
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
    // Requis : impose à tous les call sites internes (tools agents) de
    // s'attribuer leurs écritures pour le versioning.
    actor: nodeDataVersionActorValidator,
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return NodeDataModels.updateValues(ctx, args);
  },
});

export const deleteWithCascade = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    actor: v.optional(nodeDataVersionActorValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await NodeDataModels.deleteNodeDataWithCascade(ctx, args);
    return null;
  },
});

export const readNodeData = internalQuery({
  args: { _id: v.id("nodeDatas") },
  handler: async (ctx, args) => {
    return NodeDataModels.readNodeData(ctx, args);
  },
});
