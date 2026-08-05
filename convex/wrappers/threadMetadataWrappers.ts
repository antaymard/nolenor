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
    additionalUsageUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { threadId, additionalUsageUsd } = args;

    // Query the threadMetadata by threadId using the index
    const threadMetadata = await ctx.db
      .query("threadMetadata")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .unique();

    if (!threadMetadata) {
      throw new Error(`Thread metadata not found for threadId: ${threadId}`);
    }

    // Update the threadMetadata with the new totalUsageUsd, lastMessageTime, roundsNb, and unique touchedNodeDataIds
    await ctx.db.patch("threadMetadata", threadMetadata._id, {
      totalUsageUsd: threadMetadata.totalUsageUsd + (additionalUsageUsd ?? 0),
      lastMessageTime: Date.now(),
      roundsNb: threadMetadata.roundsNb ? threadMetadata.roundsNb + 1 : 1,
    });
  },
});

export const updateTouchNodeData = internalMutation({
  args: {
    threadId: v.string(),
    additionalTouchedNodeDataIds: v.array(v.id("nodeDatas")),
  },
  handler: async (ctx, args) => {
    const { threadId, additionalTouchedNodeDataIds } = args;

    // Query the threadMetadata by threadId using the index
    const threadMetadata = await ctx.db
      .query("threadMetadata")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .unique();

    if (!threadMetadata) {
      throw new Error(`Thread metadata not found for threadId: ${threadId}`);
    }

    // Create a new set of unique touchedNodeDataIds by combining existing and additional ones
    const existingTouchedNodeDataIds = threadMetadata.touchedNodeDataIds || [];
    const uniqueTouchedNodeDataIds = Array.from(
      new Set([...existingTouchedNodeDataIds, ...additionalTouchedNodeDataIds]),
    );

    await ctx.db.patch("threadMetadata", threadMetadata._id, {
      touchedNodeDataIds: uniqueTouchedNodeDataIds,
    });
    return;
  },
});
