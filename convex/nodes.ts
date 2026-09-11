import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import { nodeTypeValidator } from "./schemas/nodeTypeSchema";
import { nodesValidator } from "./schemas/nodesSchema";

export const create = mutation({
  args: {
    node: nodesValidator.omit("id", "nodeDataId"),
    nodeDataValues: v.record(v.string(), v.any()),
    nodeDataTemplateId: v.optional(v.id("nodeDataTemplates")),
  },
  handler: async (ctx, args) => {
    // Get permissions from canvasId and user
    const authUserId = await requireAuth(ctx);
    const { canvasId } = args;
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    // Create nodeData => use Models ? Validate schema
    // Return nodeDataId

    // Create node with position etc
    // 1. create llmId
    // 2. Check if no conflict with existing llmId, of conflict, regenerate
    // 3. Create node with nodeDataId and llmId

    // Return nodeId
  },
});

export const trash = mutation({
  args: {
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    // check permissions
    const authUserId = await requireAuth(ctx);

    // Get canvasId from nodeId
    //
    // Check permissions on canvasId
    //
    // Update node to status = trashed
    // Return nodeId
  },
});
