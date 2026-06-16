import { v } from "convex/values";

const threadMetadataValidator = v.object({
  threadId: v.string(),
  userId: v.id("users"),
  canvasId: v.id("canvases"),
  totalUsageUsd: v.number(),
  agentName: v.string(),
  lastMessageTime: v.optional(v.number()),
  roundsNb: v.optional(v.number()),
});

export { threadMetadataValidator };
