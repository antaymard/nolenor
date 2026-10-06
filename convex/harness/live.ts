import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { requireAuth, requireCanvasAccess } from "../lib/auth";
import * as NodeModels from "../models/nodeModels";
import * as ThreadMetadataModels from "../models/threadMetadataModels";
import {
  agentTaskKinds,
  agentTaskStatuses,
  liveAgentTaskStatuses,
} from "../schemas/agentTasksSchema";
import { runWrites, targetNodeIds } from "./runWrites";

/**
 * Lectures de la harness pour l'UI et le diagnostic.
 */

const LIVE_LIMIT = 50;
/** Runs suivis par canvas pour le halo « écrit par Nolë ». */
const ACTIVE_RUNS_LIMIT = 5;

/**
 * L'activité de Nolë sur un canvas, pour la montrer en live :
 * - `calls` : les tool calls en cours — quel thread, quel tool, quels nodes ;
 * - `written` : les nodes que les runs en cours ont déjà écrits ou créés.
 */
export const listLiveActivity = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const userId = await requireAuth(ctx);
    // Monté pour tout canvas ouvert : sans accès, rien à montrer, pas d'erreur.
    try {
      await requireCanvasAccess(ctx, canvasId, userId, "viewer");
    } catch {
      return { calls: [], written: [] };
    }

    const calls = [];
    const runs = new Map<string, { threadId: string; runMessageId: string }>();
    for (const status of liveAgentTaskStatuses) {
      const tasks = await ctx.db
        .query("agentTasks")
        .withIndex("by_canvasId_and_status", (q) =>
          q.eq("canvasId", canvasId).eq("status", status),
        )
        .take(LIVE_LIMIT);
      for (const task of tasks) {
        if (task.kind === agentTaskKinds.generation) {
          runs.set(task.runMessageId, {
            threadId: task.threadId,
            runMessageId: task.runMessageId,
          });
          continue;
        }
        if (status === agentTaskStatuses.waiting || !task.toolName) continue;
        calls.push({
          taskId: task._id,
          threadId: task.threadId,
          toolName: task.toolName,
          explanation: task.explanation ?? null,
          status: task.status,
          // Un tool rejouable sans risque est un tool sans effet : une lecture.
          access: task.replay === "safe" ? ("read" as const) : ("write" as const),
          nodeIds: targetNodeIds(task.input),
        });
      }
    }

    const written = [];
    for (const run of [...runs.values()].slice(0, ACTIVE_RUNS_LIMIT)) {
      const writes = await runWrites(ctx, run);
      const nodeIds = new Set(writes.nodeIds);
      for (const nodeDataId of writes.nodeDataIds) {
        const node = await NodeModels.getNodeByNodeDataId(ctx, { nodeDataId });
        if (node && node.canvasId === canvasId && node.status !== "trashed") {
          nodeIds.add(node.id);
        }
      }
      for (const nodeId of nodeIds) {
        written.push({ threadId: run.threadId, nodeId });
      }
    }
    return { calls, written };
  },
});

/**
 * Les points de coupe des compactions d'un thread : le chat y place un
 * séparateur « résumé au-dessus ». La position seule, pas le résumé.
 */
export const listCompactionPoints = query({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const userId = await requireAuth(ctx);
    const row = await ThreadMetadataModels.findByThreadId(ctx, { threadId });
    if (!row || row.userId !== userId) return [];
    const rows = await ctx.db
      .query("compactions")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .take(50);
    return rows.map((compaction) => ({
      _id: compaction._id,
      order: compaction.firstKeptOrder,
      stepOrder: compaction.firstKeptStepOrder,
    }));
  },
});

/**
 * Diagnostic : pour chaque tâche d'un run, le délai entre sa création et le
 * démarrage de son action (le coût d'un saut de scheduler) et sa durée.
 * À lancer depuis le dashboard : `harness/live:runTimings`.
 */
export const runTimings = internalQuery({
  args: { runMessageId: v.string() },
  handler: async (ctx, { runMessageId }) => {
    const rows = [];
    for (const kind of [agentTaskKinds.generation, agentTaskKinds.tool]) {
      const tasks = await ctx.db
        .query("agentTasks")
        .withIndex("by_runMessageId_and_kind", (q) =>
          q.eq("runMessageId", runMessageId).eq("kind", kind),
        )
        .take(500);
      for (const task of tasks) {
        rows.push({
          kind: task.kind,
          step: task.step ?? null,
          toolName: task.toolName ?? null,
          status: task.status,
          attempt: task.attempt,
          scheduleDelayMs:
            task.startedAt !== undefined
              ? task.startedAt - task._creationTime
              : null,
          durationMs:
            task.startedAt !== undefined && task.endedAt !== undefined
              ? task.endedAt - task.startedAt
              : null,
        });
      }
    }
    const delays = rows
      .map((row) => row.scheduleDelayMs)
      .filter((delay): delay is number => delay !== null)
      .sort((a, b) => a - b);
    return {
      tasks: rows.sort((a, b) => (a.step ?? 0) - (b.step ?? 0)),
      scheduleDelayMs: {
        count: delays.length,
        median: delays[Math.floor(delays.length / 2)] ?? null,
        max: delays[delays.length - 1] ?? null,
      },
    };
  },
});
