import { getThreadMetadata } from "@convex-dev/agent";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import * as RunModels from "./models/runModels";
import * as ThreadMetadataModels from "./models/threadMetadataModels";
import {
  RUN_STALE_MS,
  threadAgentNames,
} from "./schemas/threadMetadataSchema";

/**
 * Les tâches de Nolë sur un canvas : un run = une tâche (cf.
 * schemas/runsSchema.ts). Le thread n'en est que le contexte.
 */

/** Runs lus pour trouver ceux qui restent à montrer. */
const RUNS_SCAN_LIMIT = 60;

/**
 * Ce que le dock affiche : les tâches qui tournent, celles qui attendent une
 * réponse, et celles finies sans avoir été relues. Un thread peut en avoir
 * plusieurs : une tâche non relue garde sa carte quand le thread repart sur
 * une autre demande.
 *
 * Mêmes champs que les threads du dock (`threads.listPendingThreads`), plus
 * la demande : la carte se lit pareil.
 */
export const listPendingRuns = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const userId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, userId, "viewer");

    const runs = (
      await ctx.db
        .query("runs")
        .withIndex("by_canvasId_and_userId", (q) =>
          q.eq("canvasId", canvasId).eq("userId", userId),
        )
        .order("desc")
        .take(RUNS_SCAN_LIMIT)
    ).filter(
      // Écartée = sortie du dock, qu'elle soit finie ou non : un run « stale »
      // qu'on écarte garde son `endedAt` vide (la harness peut encore le
      // conclure), mais sa carte disparaît. Une tâche en cours ou en attente
      // n'est jamais écartée (cf. markRunReviewed).
      (run) => run.agentName === threadAgentNames.nole && run.reviewedAt === undefined,
    );

    return Promise.all(
      runs.map(async (run) => {
        const thread = await getThreadMetadata(ctx, components.agent, {
          threadId: run.threadId,
        }).catch(() => null);
        let pendingQuestions: unknown[] | null = null;
        if (run.status === "waiting") {
          const row = await ThreadMetadataModels.findByThreadId(ctx, {
            threadId: run.threadId,
          });
          const taskId = row?.run?.awaitingTaskId;
          const task = taskId ? await ctx.db.get("agentTasks", taskId) : null;
          const questions = (task?.input as { questions?: unknown } | undefined)
            ?.questions;
          pendingQuestions = Array.isArray(questions) ? questions : null;
        }
        return {
          runId: run._id,
          threadId: run.threadId,
          title: thread?.title?.trim() || null,
          request: run.request,
          runStatus: run.status,
          runStartedAt: run.startedAt,
          runEndedAt: run.endedAt ?? null,
          reviewedAt: run.reviewedAt ?? null,
          touchedNodes: run.touchedNodes ?? [],
          lastActivity: run.lastActivity ?? null,
          lastRunError: run.error ?? null,
          pendingQuestions,
        };
      }),
    );
  },
});

/**
 * Écarte une tâche du dock. Une tâche en cours ne se relit pas (sauf si elle
 * a cessé de répondre) ; quand le thread n'a plus rien à relire, il sort
 * aussi de la home.
 */
export const markRunReviewed = mutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const userId = await requireAuth(ctx);
    const run = await ctx.db.get("runs", runId);
    if (!run || run.userId !== userId || run.reviewedAt !== undefined) {
      return null;
    }
    if (run.endedAt === undefined) {
      // Un run qui ne répond plus s'écarte sans être clos : s'il est encore
      // vivant, c'est la harness qui posera sa vraie fin.
      const isStale = Date.now() - run.startedAt > RUN_STALE_MS;
      if (!isStale || run.status === "waiting") return null;
      await ctx.db.patch("runs", runId, { reviewedAt: Date.now() });
    } else {
      await RunModels.markReviewed(ctx, run);
    }
    if (!(await RunModels.hasUnreviewedRun(ctx, run.threadId))) {
      await ThreadMetadataModels.markReviewed(ctx, { threadId: run.threadId });
    }
    return null;
  },
});
