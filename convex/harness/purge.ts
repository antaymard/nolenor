import { v } from "convex/values";
import { components } from "../_generated/api";
import type { Id, TableNames } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import * as RunModels from "../models/runModels";
import { agentTaskKinds } from "../schemas/agentTasksSchema";
import { haltRun } from "./tasks";

/**
 * Ce que l'app garde d'un thread hors du composant agent — runs et leurs
 * tâches, prompts figés, compactions, messages en file, demandes de
 * l'omnibar, metadata des messages —, supprimé par lots quand le thread ou le
 * compte l'est. La ligne `threadMetadata` et les messages du composant
 * restent à l'appelant.
 */

/** Suppressions par transaction : chaque ligne supprimée est aussi lue. */
const PURGE_BATCH = 100;

/** Supprime un lot ; rend `true` s'il en reste. */
export async function purgeThreadStep(
  ctx: MutationCtx,
  threadId: string,
): Promise<boolean> {
  await haltRun(ctx, threadId);
  let left = PURGE_BATCH;
  const remove = async (docs: { _id: Id<TableNames> }[]) => {
    for (const doc of docs) await ctx.db.delete(doc._id);
    left -= docs.length;
    return left <= 0;
  };

  // Les runs, un à un : leurs tâches, leur prompt figé, leur ligne. Les runs
  // d'avant la table `runs` ne se retrouvent que par leur prompt.
  for (;;) {
    const run = await ctx.db
      .query("runs")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .first();
    const runMessageId =
      run?.runMessageId ??
      (
        await ctx.db
          .query("runPrompts")
          .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
          .first()
      )?.messageId;
    if (!runMessageId) break;
    for (const kind of Object.values(agentTaskKinds)) {
      const tasks = await ctx.db
        .query("agentTasks")
        .withIndex("by_runMessageId_and_kind", (q) =>
          q.eq("runMessageId", runMessageId).eq("kind", kind),
        )
        .take(left);
      if (await remove(tasks)) return true;
    }
    const prompts = await ctx.db
      .query("runPrompts")
      .withIndex("by_messageId", (q) => q.eq("messageId", runMessageId))
      .take(left);
    const runRow = await RunModels.findByRunMessageId(ctx, runMessageId);
    if (await remove([...prompts, ...(runRow ? [runRow] : [])])) return true;
  }

  const others = [
    () =>
      ctx.db
        .query("compactions")
        .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
        .take(left),
    () =>
      ctx.db
        .query("submissions")
        .withIndex("by_threadId_and_status", (q) => q.eq("threadId", threadId))
        .take(left),
    () =>
      ctx.db
        .query("dispatches")
        .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
        .take(left),
    () =>
      ctx.db
        .query("messageMetadata")
        .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
        .take(left),
  ];
  for (const next of others) {
    if (await remove(await next())) return true;
  }
  return false;
}

/**
 * Un lot de la suppression d'un thread (cf. threads.deleteThread), ses
 * sous-agents d'abord : leurs threads n'existent que pour lui. Rend `true`
 * tant qu'il en reste.
 */
export const purgeThread = internalMutation({
  args: { threadId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { threadId }) => {
    // Avant tout : le run ne lance plus de sous-agent pendant la purge.
    await haltRun(ctx, threadId);
    const child = await ctx.db
      .query("threadMetadata")
      .withIndex("by_masterThreadId", (q) => q.eq("masterThreadId", threadId))
      .first();
    if (child) {
      if (await purgeThreadStep(ctx, child.threadId)) return true;
      await ctx.runMutation(
        components.agent.threads.deleteAllForThreadIdAsync,
        {
          threadId: child.threadId,
        },
      );
      await ctx.db.delete("threadMetadata", child._id);
      return true;
    }
    return purgeThreadStep(ctx, threadId);
  },
});
