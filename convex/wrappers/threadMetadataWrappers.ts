import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { findByThreadId } from "../models/threadMetadataModels";

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
    // Renseigné pour un thread de sous-agent : le thread Nolë qui l'a déclenché.
    masterThreadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { threadId, userId, canvasId, agentName, masterThreadId } = args;
    const newThreadMetadata = {
      threadId,
      userId,
      canvasId,
      totalUsageUsd: 0, // Init
      agentName,
      ...(masterThreadId ? { masterThreadId } : {}),
    };

    await ctx.db.insert("threadMetadata", newThreadMetadata);
    return newThreadMetadata;
  },
});

/**
 * Supprime la ligne de metadata d'un thread supprimé. Sans ça le listing par
 * canvas, qui part désormais de `threadMetadata`, garderait des fantômes.
 */
export const remove = internalMutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const threadMetadata = await findByThreadId(ctx, {
      threadId: args.threadId,
    });
    if (!threadMetadata) return;
    await ctx.db.delete("threadMetadata", threadMetadata._id);
  },
});

/**
 * Marque une interaction utilisateur. `updateUsage` ne stampe `lastMessageTime`
 * qu'une fois l'assistant passé ; on veut aussi dater l'envoi, sinon un tour
 * qui échoue laisse le thread paraître plus vieux qu'il ne l'est.
 */
export const touch = internalMutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const threadMetadata = await findByThreadId(ctx, {
      threadId: args.threadId,
    });
    // Pas de ligne pour les threads sans metadata (sous-agents actuels) : no-op.
    if (!threadMetadata) return;
    await ctx.db.patch("threadMetadata", threadMetadata._id, {
      lastMessageTime: Date.now(),
    });
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
