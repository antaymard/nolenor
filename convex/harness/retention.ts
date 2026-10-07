import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import * as ThreadMetadataModels from "../models/threadMetadataModels";
import { trimMessage } from "./messageTrim";
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
 * Les messages des tâches purgées sont allégés au passage de leur contenu de
 * tool et des métadonnées de leur raisonnement (cf. messageTrim.ts) : c'est
 * l'essentiel de la table `messages`.
 *
 * Un passage par table, par pages, sur la plage expirée (index de création) :
 * ce qu'on garde ne bloque pas la suite.
 *
 * À part : le transcript d'un sous-agent (cf. `purgeWorkerTranscript`).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_DATA_RETENTION_MS = 30 * DAY_MS;
const QUEUE_RETENTION_MS = 7 * DAY_MS;
/** Le temps de déboguer un sous-agent ; ensuite, seul son rapport compte. */
export const WORKER_TRANSCRIPT_RETENTION_MS = 7 * DAY_MS;
const PAGE_SIZE = 200;
/** Messages relus et réécrits par transaction : ils peuvent peser lourd. */
const TRIM_BATCH = 10;

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
    // Les messages des tâches purgées sont allégés (cf. messageTrim.ts),
    // en tâche à part (les messages sont lourds).
    const toTrim: string[] = [];
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
      if (phase === "agentTasks") {
        const task = doc as Doc<"agentTasks">;
        const messageId = task.resultMessageId ?? task.responseMessageId;
        if (messageId) toTrim.push(messageId);
      }
      await ctx.db.delete(doc._id);
      deleted += 1;
    }
    for (let i = 0; i < toTrim.length; i += TRIM_BATCH) {
      await ctx.scheduler.runAfter(0, internal.harness.retention.trimMessages, {
        messageIds: toTrim.slice(i, i + TRIM_BATCH),
      });
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

/**
 * Le transcript d'un sous-agent : ses messages et ses streams, dans le
 * composant agent. Personne ne le relit — le parent n'en garde que le
 * rapport — et c'est le plus lourd de la table `messages` (recherches web,
 * pages ouvertes, nodes lus). Planifié à la fin de son run (cf.
 * subagents.ts). La ligne `threadMetadata` reste : elle porte son coût,
 * additionné à celui de la conversation parente.
 */
export const purgeWorkerTranscript = internalMutation({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId }) => {
    const row = await ThreadMetadataModels.findByThreadId(ctx, { threadId });
    // Un thread Nolë n'est jamais visé ; un sous-agent relancé non plus.
    if (!row?.masterThreadId || row.run) return null;
    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
      threadId,
    });
    return null;
  },
});

/** Allège ces messages (cf. messageTrim.ts). */
export const trimMessages = internalMutation({
  args: { messageIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { messageIds }) => {
    const docs = await ctx.runQuery(
      components.agent.messages.getMessagesByIds,
      { messageIds },
    );
    for (const doc of docs) {
      const message = doc?.message && trimMessage(doc.message);
      if (!doc || !message) continue;
      await ctx.runMutation(components.agent.messages.updateMessage, {
        messageId: doc._id,
        patch: { message },
      });
    }
    return null;
  },
});

/**
 * Le rattrapage d'un thread (cf. migrations.trimOldMessages) : ses messages
 * de plus de 30 jours, du plus ancien, une page par transaction. S'arrête au
 * premier message plus récent.
 */
export const trimThreadMessages = internalMutation({
  args: { threadId: v.string(), cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const cutoff = Date.now() - RUN_DATA_RETENTION_MS;
    const page = await ctx.runQuery(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId: args.threadId,
        order: "asc",
        paginationOpts: { cursor: args.cursor ?? null, numItems: TRIM_BATCH },
      },
    );
    for (const doc of page.page) {
      if (doc._creationTime >= cutoff) return null;
      const message = doc.message && trimMessage(doc.message);
      if (!message) continue;
      await ctx.runMutation(components.agent.messages.updateMessage, {
        messageId: doc._id,
        patch: { message },
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.harness.retention.trimThreadMessages,
        { threadId: args.threadId, cursor: page.continueCursor },
      );
    }
    return null;
  },
});
