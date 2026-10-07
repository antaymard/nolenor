import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import * as ThreadMetadataModels from "../models/threadMetadataModels";
import { dispatchStatuses } from "../schemas/dispatchesSchema";
import { submissionStatuses } from "../schemas/submissionsSchema";

/**
 * Purge des données d'exécution, une fois par jour (cf. crons.ts). Elles ne
 * servent qu'au run qui les produit et à ce qui suit immédiatement sa fin
 * (usage, compaction, juge de réponse) :
 * - `agentTasks` et `runPrompts` : 30 jours, sauf ceux du run en cours d'un
 *   thread (une question peut attendre longtemps). La ligne `runs` reste :
 *   c'est l'historique des tâches ;
 * - `submissions` placées ou retirées, `dispatches` aiguillées : 7 jours.
 *
 * Un passage par table, par pages, sur la plage expirée (index de création) :
 * ce qu'on garde ne bloque pas la suite.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_DATA_RETENTION_MS = 30 * DAY_MS;
const QUEUE_RETENTION_MS = 7 * DAY_MS;
const PAGE_SIZE = 200;

const phases = [
  "agentTasks",
  "runPrompts",
  "submissions",
  "dispatches",
] as const;
type Phase = (typeof phases)[number];
const vPhase = v.union(...phases.map((phase) => v.literal(phase)));

/** Le run est-il le run en cours de son thread ? Lu une fois par thread. */
function liveRunChecker(ctx: MutationCtx) {
  const runByThread = new Map<string, string | null>();
  return async (threadId: string, runMessageId: string) => {
    if (!runByThread.has(threadId)) {
      const row = await ThreadMetadataModels.findByThreadId(ctx, { threadId });
      runByThread.set(threadId, row?.run?.startMessageId ?? null);
    }
    return runByThread.get(threadId) === runMessageId;
  };
}

type Page<T> = { page: T[]; isDone: boolean; continueCursor: string };

async function expiredPage(
  ctx: MutationCtx,
  phase: Phase,
  cursor: string | null,
  now: number,
): Promise<Page<Doc<Phase>>> {
  const cutoff =
    now -
    (phase === "agentTasks" || phase === "runPrompts"
      ? RUN_DATA_RETENTION_MS
      : QUEUE_RETENTION_MS);
  return (await ctx.db
    .query(phase)
    .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
    .paginate({ numItems: PAGE_SIZE, cursor })) as Page<Doc<Phase>>;
}

export const purgeExpired = internalMutation({
  args: {
    phase: v.optional(vPhase),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const phase = args.phase ?? phases[0];
    const slice = await expiredPage(
      ctx,
      phase,
      args.cursor ?? null,
      Date.now(),
    );
    const isLiveRun = liveRunChecker(ctx);

    let deleted = 0;
    for (const doc of slice.page) {
      const expired =
        phase === "agentTasks"
          ? !(await isLiveRun(
              (doc as Doc<"agentTasks">).threadId,
              (doc as Doc<"agentTasks">).runMessageId,
            ))
          : phase === "runPrompts"
            ? !(await isLiveRun(
                (doc as Doc<"runPrompts">).threadId,
                (doc as Doc<"runPrompts">).messageId,
              ))
            : phase === "submissions"
              ? (doc as Doc<"submissions">).status !== submissionStatuses.queued
              : (doc as Doc<"dispatches">).status !== dispatchStatuses.routing;
      if (!expired) continue;
      await ctx.db.delete(doc._id);
      deleted += 1;
    }
    if (deleted > 0) {
      console.log("[retention] purged", { phase, deleted });
    }

    const next = slice.isDone ? phases[phases.indexOf(phase) + 1] : phase;
    if (next) {
      await ctx.scheduler.runAfter(0, internal.harness.retention.purgeExpired, {
        phase: next,
        ...(slice.isDone ? {} : { cursor: slice.continueCursor }),
      });
    }
    return null;
  },
});
