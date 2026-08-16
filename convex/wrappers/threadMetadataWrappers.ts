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
 * Marque une interaction utilisateur. La comptabilité d'usage ne stampe
 * `lastMessageTime` qu'une fois l'assistant passé ; on veut aussi dater
 * l'envoi, sinon un tour qui échoue laisse le thread paraître plus vieux qu'il
 * ne l'est.
 *
 * C'est aussi ici, et pas dans la comptabilité de coût, qu'on incrémente
 * `roundsNb` : le `usageHandler` du composant agent est appelé une fois par
 * step LLM, donc y compter les rounds revenait à compter des steps.
 */
export const touch = internalMutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const threadMetadata = await findByThreadId(ctx, {
      threadId: args.threadId,
    });
    // Pas de ligne pour les threads sans metadata : no-op.
    if (!threadMetadata) return;
    await ctx.db.patch("threadMetadata", threadMetadata._id, {
      lastMessageTime: Date.now(),
      roundsNb: (threadMetadata.roundsNb ?? 0) + 1,
    });
  },
});

// `updateUsage` et `updateTouchNodeData` vivaient ici. Le premier throwait
// quand le thread n'avait pas de ligne de metadata (cas des sous-agents), ce
// qui aurait fait échouer un tour déjà streamé ; il est remplacé par
// `ThreadMetadataModels.addUsage`, appelé depuis `aiUsageModels.recordUsage`
// pour que le total du thread et le ledger soient écrits dans la même
// transaction. Le second n'avait aucun appelant.
