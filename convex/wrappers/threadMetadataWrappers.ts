import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

export const read = internalQuery({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const { threadId } = args;
    const threadMetadata = await ctx.db
      .query("threadMetadata")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .unique();

    return threadMetadata;
  },
});

export const create = internalMutation({
  args: {
    threadId: v.string(),
    userId: v.id("users"),
    canvasId: v.id("canvases"),
    agentName: v.string(),
  },
  handler: async (ctx, args) => {
    const { threadId, userId, canvasId, agentName } = args;
    const newThreadMetadata = {
      threadId,
      userId,
      canvasId,
      totalUsageUsd: 0, // Init
      agentName,
    };

    await ctx.db.insert("threadMetadata", newThreadMetadata);
    return newThreadMetadata;
  },
});

export const updateUsage = internalMutation({
  args: {
    threadId: v.string(),
    additionalUsageUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const { threadId, additionalUsageUsd } = args;

    // Atomically update the totalUsageUsd field
    const threadMetadata = await ctx.db
      .query("threadMetadata")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .unique();

    if (!threadMetadata) {
      throw new Error(`Thread metadata not found for threadId: ${threadId}`);
    }

    await ctx.db.patch("threadMetadata", threadMetadata._id, {
      totalUsageUsd: threadMetadata.totalUsageUsd + additionalUsageUsd,
      lastMessageTime: Date.now(),
      roundsNb: threadMetadata.roundsNb ? threadMetadata.roundsNb + 1 : 1,
    });
  },
});
