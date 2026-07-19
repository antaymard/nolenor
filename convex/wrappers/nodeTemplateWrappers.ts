import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import * as NodeTemplateModels from "../models/nodeTemplateModels";

// Lecture d'un template par id (tools agents : create_node, set_node_data,
// read_nodes). L'appelant décide quoi faire d'un null.
export const getTemplate = internalQuery({
  args: { templateId: v.id("nodeTemplates") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.templateId);
  },
});

export const getTemplates = internalQuery({
  args: { templateIds: v.array(v.id("nodeTemplates")) },
  handler: async (ctx, args) => {
    const docs = await Promise.all(
      args.templateIds.map((id) => ctx.db.get(id)),
    );
    return docs.filter((d) => d !== null);
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
