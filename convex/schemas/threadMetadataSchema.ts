import { v } from "convex/values";

const threadMetadataValidator = v.object({
  threadId: v.string(),
  userId: v.id("users"),
  canvasId: v.id("canvases"),
  totalUsageUsd: v.number(),
  touchedNodeDataIds: v.optional(v.array(v.id("nodeDatas"))), // Nodedata that have been modified during the thread, by the agent
  agentName: v.string(),
  lastMessageTime: v.optional(v.number()),
  roundsNb: v.optional(v.number()),
});

export { threadMetadataValidator };
