import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import * as ThreadMetadataModels from "../models/threadMetadataModels";
import { agentTaskKinds } from "../schemas/agentTasksSchema";

/** Les nodes visés par un appel, lus dans ses arguments (`nodeIds` ou `nodeId`). */
export function targetNodeIds(input: unknown): string[] {
  if (typeof input !== "object" || input === null) return [];
  const { nodeIds, nodeId } = input as { nodeIds?: unknown; nodeId?: unknown };
  if (Array.isArray(nodeIds)) {
    return nodeIds.filter((id): id is string => typeof id === "string");
  }
  return typeof nodeId === "string" ? [nodeId] : [];
}

/**
 * Ce qu'un run a écrit sur le canvas, par recoupement : les nodes visés par
 * ses tool calls d'écriture (ids de canvas), et ceux que son thread a créés
 * ou modifiés pour la première fois depuis le début du run (nodeDataIds).
 *
 * Provisoire, faute d'acteur sur les écritures : à remplacer par une table de
 * modifications quand elle existera.
 */
export async function runWrites(
  ctx: QueryCtx,
  run: { threadId: string; runMessageId: string },
): Promise<{ nodeIds: Set<string>; nodeDataIds: Set<Id<"nodeDatas">> }> {
  const nodeIds = new Set<string>();
  const tools = await ctx.db
    .query("agentTasks")
    .withIndex("by_runMessageId_and_kind", (q) =>
      q.eq("runMessageId", run.runMessageId).eq("kind", agentTaskKinds.tool),
    )
    .take(500);
  for (const tool of tools) {
    if (tool.replay === "safe") continue; // une lecture n'écrit rien
    for (const id of targetNodeIds(tool.input)) nodeIds.add(id);
  }

  const [firstGeneration] = await ctx.db
    .query("agentTasks")
    .withIndex("by_runMessageId_and_kind", (q) =>
      q
        .eq("runMessageId", run.runMessageId)
        .eq("kind", agentTaskKinds.generation),
    )
    .take(1);
  const nodeDataIds = new Set<Id<"nodeDatas">>();
  if (firstGeneration) {
    const thread = await ThreadMetadataModels.findByThreadId(ctx, {
      threadId: run.threadId,
    });
    for (const touch of thread?.touchedNodes ?? []) {
      if (touch.at >= firstGeneration._creationTime && touch.kind !== "deleted") {
        nodeDataIds.add(touch.nodeDataId);
      }
    }
  }
  return { nodeIds, nodeDataIds };
}
