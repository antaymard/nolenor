import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import * as ThreadMetadataModels from "../models/threadMetadataModels";
import { findByThreadId } from "../models/threadMetadataModels";
import { threadRunStatuses } from "../schemas/threadMetadataSchema";

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
 * Ouvre un tour : date l'interaction, incrémente `roundsNb`, et passe le
 * thread en `running`. Renvoie le jeton de run que `markRunEnded` exigera
 * pour le conclure (cf. `ThreadMetadataModels.markRunStarted`).
 */
export const markRunStarted = internalMutation({
  args: {
    threadId: v.string(),
  },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { threadId }) => {
    return ThreadMetadataModels.markRunStarted(ctx, { threadId });
  },
});

/**
 * Sort le thread de `running`. Appelé depuis l'action de streaming, qui ne
 * peut pas toucher la base directement.
 */
export const markRunEnded = internalMutation({
  args: {
    threadId: v.string(),
    status: v.union(
      v.literal(threadRunStatuses.idle),
      v.literal(threadRunStatuses.error),
      v.literal(threadRunStatuses.aborted),
    ),
    runToken: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ThreadMetadataModels.markRunEnded(ctx, args);
    return null;
  },
});

// `touch` vivait ici : il est devenu `markRunStarted`, qui fait la même chose
// et pose en plus l'état du run. Son unique appelant était `ia/nole.saveMessage`.
//
// `updateUsage` et `updateTouchNodeData` vivaient ici aussi. Le premier throwait
// quand le thread n'avait pas de ligne de metadata (cas des sous-agents), ce
// qui aurait fait échouer un tour déjà streamé ; il est remplacé par
// `ThreadMetadataModels.addUsage`, appelé depuis `aiUsageModels.recordUsage`
// pour que le total du thread et le ledger soient écrits dans la même
// transaction. Le second n'avait aucun appelant ; il revit sous la forme de
// `ThreadMetadataModels.addTouchedNode`, appelé cette fois depuis les wrappers
// de nodeDatas, dans la transaction du write qu'il trace.
