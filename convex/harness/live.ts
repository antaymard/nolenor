import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { requireAuth, requireCanvasAccess } from "../lib/auth";
import {
  agentTaskKinds,
  agentTaskStatuses,
} from "../schemas/agentTasksSchema";

/**
 * Lectures de la harness pour l'UI et le diagnostic.
 */

const LIVE_LIMIT = 50;

/** Les nodes visés par un appel, lus dans ses arguments (`nodeIds` ou `nodeId`). */
function targetNodeIds(input: unknown): string[] {
  if (typeof input !== "object" || input === null) return [];
  const { nodeIds, nodeId } = input as { nodeIds?: unknown; nodeId?: unknown };
  if (Array.isArray(nodeIds)) {
    return nodeIds.filter((id): id is string => typeof id === "string");
  }
  return typeof nodeId === "string" ? [nodeId] : [];
}

/**
 * Les tool calls en cours sur un canvas, pour les mettre en évidence en live :
 * quel thread, quel tool, sur quels nodes.
 */
export const listLiveToolCalls = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const userId = await requireAuth(ctx);
    // Monté pour tout canvas ouvert : sans accès, rien à montrer, pas d'erreur.
    try {
      await requireCanvasAccess(ctx, canvasId, userId, "viewer");
    } catch {
      return [];
    }

    const calls = [];
    for (const status of [agentTaskStatuses.pending, agentTaskStatuses.running]) {
      const tasks = await ctx.db
        .query("agentTasks")
        .withIndex("by_canvasId_and_status", (q) =>
          q.eq("canvasId", canvasId).eq("status", status),
        )
        .take(LIVE_LIMIT);
      for (const task of tasks) {
        if (task.kind !== agentTaskKinds.tool || !task.toolName) continue;
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
    return calls;
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
