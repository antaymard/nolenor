import type { Doc, Id } from "../_generated/dataModel";
import { components } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import * as RunModels from "../models/runModels";
import { agentTaskKinds } from "../schemas/agentTasksSchema";

/**
 * Ce qu'un run a fait, relu dans ses tâches : ses générations, ses tool
 * calls, sa réponse finale, ce qu'il a écrit. Lectures seulement.
 */

/** Plafond de lecture : bien au-delà de ce qu'un run produit. */
const RUN_TASKS_LIMIT = 500;

type Task = Doc<"agentTasks">;

/** Les nodes visés par un appel, lus dans ses arguments (`nodeIds` ou `nodeId`). */
export function targetNodeIds(input: unknown): string[] {
  if (typeof input !== "object" || input === null) return [];
  const { nodeIds, nodeId } = input as { nodeIds?: unknown; nodeId?: unknown };
  if (Array.isArray(nodeIds)) {
    return nodeIds.filter((id): id is string => typeof id === "string");
  }
  return typeof nodeId === "string" ? [nodeId] : [];
}

/** Les générations d'un run, dans l'ordre de création. */
export async function runGenerations(
  ctx: QueryCtx,
  runMessageId: string,
): Promise<Task[]> {
  return await ctx.db
    .query("agentTasks")
    .withIndex("by_runMessageId_and_kind", (q) =>
      q.eq("runMessageId", runMessageId).eq("kind", agentTaskKinds.generation),
    )
    .take(RUN_TASKS_LIMIT);
}

/** Les tool calls d'un run, dans l'ordre de création. */
export async function runToolTasks(
  ctx: QueryCtx,
  runMessageId: string,
  limit = RUN_TASKS_LIMIT,
): Promise<Task[]> {
  return await ctx.db
    .query("agentTasks")
    .withIndex("by_runMessageId_and_kind", (q) =>
      q.eq("runMessageId", runMessageId).eq("kind", agentTaskKinds.tool),
    )
    .take(limit);
}

/** La dernière génération qui a répondu : sa réponse est celle du run. */
export function lastResponse(generations: Task[]): Task | undefined {
  let last: Task | undefined;
  for (const generation of generations) {
    if (
      generation.responseMessageId &&
      (!last || (generation.step ?? 0) > (last.step ?? 0))
    ) {
      last = generation;
    }
  }
  return last;
}

/** Le texte de la réponse finale du run ; `""` s'il n'en a pas. */
export async function finalResponseText(
  ctx: QueryCtx | MutationCtx,
  runMessageId: string,
): Promise<string> {
  const messageId = lastResponse(
    await runGenerations(ctx, runMessageId),
  )?.responseMessageId;
  if (!messageId) return "";
  const [message] = await ctx.runQuery(
    components.agent.messages.getMessagesByIds,
    { messageIds: [messageId] },
  );
  return message?.text?.trim() ?? "";
}

/**
 * Ce qu'un run a écrit sur le canvas : les nodes visés par ses tool calls
 * d'écriture (ids de canvas), et ceux qu'il a créés ou modifiés
 * (`runs.touchedNodes`, nodeDataIds).
 *
 * Provisoire, faute d'acteur sur les écritures : à remplacer par une table de
 * modifications quand elle existera.
 */
export async function runWrites(
  ctx: QueryCtx,
  run: { runMessageId: string },
  /** Les tool calls du run, quand l'appelant les a déjà lus. */
  preloadedTools?: Task[],
): Promise<{ nodeIds: Set<string>; nodeDataIds: Set<Id<"nodeDatas">> }> {
  const nodeIds = new Set<string>();
  const tools = preloadedTools ?? (await runToolTasks(ctx, run.runMessageId));
  for (const tool of tools) {
    if (tool.replay === "safe") continue; // une lecture n'écrit rien
    for (const id of targetNodeIds(tool.input)) nodeIds.add(id);
  }

  const nodeDataIds = new Set<Id<"nodeDatas">>();
  const row = await RunModels.findByRunMessageId(ctx, run.runMessageId);
  for (const touch of row?.touchedNodes ?? []) {
    if (touch.kind !== "deleted") nodeDataIds.add(touch.nodeDataId);
  }
  return { nodeIds, nodeDataIds };
}
