import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import * as NodeTemplateModels from "../models/nodeTemplateModels";

// Lecture d'un template par id (tools agents : create_node, set_node_data,
// nole read). L'appelant décide quoi faire d'un null.
export const getTemplate = internalQuery({
  args: { templateId: v.id("nodeTemplates") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.templateId);
  },
});

// Catalogue des templates d'un user (system prompt de l'agent).
export const listByCreator = internalQuery({
  args: {
    creatorId: v.id("users"),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return NodeTemplateModels.listByCreator(ctx, args);
  },
});
