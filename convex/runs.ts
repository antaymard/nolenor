import { getThreadMetadata } from "@convex-dev/agent";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { submitToThread } from "./harness/tasks";
import { RUN_SUBAGENT } from "./harness/kernelTools";
import { getProfile } from "./harness/profiles";
import { noleProfile, type NoleRunInput } from "./ia/profiles/nole";
import { agentTaskKinds } from "./schemas/agentTasksSchema";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import * as MessageMetadataModels from "./models/messageMetadataModels";
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
        const failed = run.status === "error" || run.status === "aborted";
        // Les nodes joints au message qui a ouvert le run : le contexte de la
        // demande, à côté de son texte.
        const startMessage = await MessageMetadataModels.findByMessageId(ctx, {
          messageId: run.runMessageId,
        });
        return {
          runId: run._id,
          threadId: run.threadId,
          title: thread?.title?.trim() || null,
          request: run.request,
          attachedNodes: startMessage?.attachments?.nodes ?? [],
          runStatus: run.status,
          runStartedAt: run.startedAt,
          runEndedAt: run.endedAt ?? null,
          reviewedAt: run.reviewedAt ?? null,
          touchedNodes: run.touchedNodes ?? [],
          lastActivity: run.lastActivity ?? null,
          lastRunError: run.error ?? null,
          pendingQuestions,
          // Les signaux de l'issue : la carte en déduit quoi mettre en avant
          // (cf. src/components/canvas/tasks/taskView.ts). Ils se combinent :
          // un échec peut être partiel (`canvas` aussi), une synthèse a une
          // réponse ET des nodes.
          outcome: {
            canvas: (run.touchedNodes?.length ?? 0) > 0,
            // `null` : pas encore jugé (le run tourne, ou le juge passe).
            answer: run.answer ?? null,
            answerText: run.answerText ?? null,
            needsUser: run.status === "waiting",
            pending: await backgroundWorkInFlight(ctx, run.runMessageId),
            failed,
          },
        };
      }),
    );
  },
});

/** Les sous-agents d'arrière-plan lancés par ce run et pas encore revenus. */
async function backgroundWorkInFlight(
  ctx: QueryCtx,
  runMessageId: string,
): Promise<number> {
  const tools = await ctx.db
    .query("agentTasks")
    .withIndex("by_runMessageId_and_kind", (q) =>
      q.eq("runMessageId", runMessageId).eq("kind", agentTaskKinds.tool),
    )
    .take(200);
  let inFlight = 0;
  for (const tool of tools) {
    const background =
      (tool.input as { background?: unknown } | undefined)?.background === true;
    if (tool.toolName !== RUN_SUBAGENT || !background || !tool.childThreadId) {
      continue;
    }
    const child = await ThreadMetadataModels.findByThreadId(ctx, {
      threadId: tool.childThreadId,
    });
    if (child?.run) inFlight++;
  }
  return inFlight;
}

/**
 * « Retry » d'une tâche en échec ou arrêtée : sa demande repart dans son
 * thread, et l'ancienne carte s'écarte.
 */
export const retryRun = mutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const userId = await requireAuth(ctx);
    const run = await ctx.db.get("runs", runId);
    if (
      !run ||
      run.userId !== userId ||
      (run.status !== "error" && run.status !== "aborted")
    ) {
      return { retried: false };
    }
    await requireCanvasAccess(ctx, run.canvasId, userId, "editor");
    const [start] = await ctx.runQuery(
      components.agent.messages.getMessagesByIds,
      { messageIds: [run.runMessageId] },
    );
    const prompt = start?.text?.trim();
    if (!prompt) return { retried: false };

    await RunModels.markReviewed(ctx, run);
    await submitToThread(ctx, {
      threadId: run.threadId,
      userId,
      canvasId: run.canvasId,
      // Le profil d'origine (Nolë pour les runs antérieurs à ce champ), et le
      // même nom d'agent : la tâche relancée reste dans le même dock.
      profile: {
        ...getProfile(run.profile ?? noleProfile.name),
        agentName: run.agentName,
      },
      prompt,
      // Le contexte du canvas est recalculé à l'ouverture du run ; s'il part
      // en steer, le texte seul suffit.
      content: prompt,
      input: { userPrompt: prompt } satisfies NoleRunInput,
    });
    return { retried: true };
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
