import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { threadAgentNames } from "../schemas/threadMetadataSchema";

type ThreadMetadata = Doc<"threadMetadata">;

export async function findByThreadId(
  ctx: QueryCtx,
  { threadId }: { threadId: string },
): Promise<ThreadMetadata | null> {
  return await ctx.db
    .query("threadMetadata")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .unique();
}

/**
 * Conversations Nolë d'un utilisateur sur un canvas, les plus récemment créées
 * d'abord. `agentName` fait partie de la clé d'index : les threads de
 * sous-agents ne sont pas scannés, seulement écartés (cf. threadMetadataSchema).
 */
export async function listNoleThreadsByUserAndCanvas(
  ctx: QueryCtx,
  {
    userId,
    canvasId,
    limit,
  }: { userId: Id<"users">; canvasId: Id<"canvases">; limit: number },
): Promise<ThreadMetadata[]> {
  return await ctx.db
    .query("threadMetadata")
    .withIndex("by_userId_and_canvasId_and_agentName", (q) =>
      q
        .eq("userId", userId)
        .eq("canvasId", canvasId)
        .eq("agentName", threadAgentNames.nole),
    )
    .order("desc")
    .take(limit);
}

/**
 * Dernière activité connue d'un thread : l'envoi/réponse le plus récent, ou à
 * défaut sa création (un thread créé mais jamais utilisé).
 */
export function lastActivityTime(metadata: ThreadMetadata): number {
  return metadata.lastMessageTime ?? metadata._creationTime;
}

/**
 * Ajoute un coût au total du thread. Prend la ligne déjà lue plutôt que de la
 * re-query : l'appelant (aiUsageModels.recordUsage) en a besoin de toute façon
 * pour dénormaliser le canvasId.
 *
 * No-op silencieux quand la ligne n'existe pas : la comptabilité ne doit jamais
 * faire échouer un tour dont la réponse est déjà partie. C'est ce que l'ancien
 * `threadMetadataWrappers.updateUsage` faisait de travers, en throwant.
 */
export async function addUsage(
  ctx: MutationCtx,
  {
    threadRow,
    costUsd,
  }: { threadRow: ThreadMetadata | null; costUsd: number },
): Promise<void> {
  if (!threadRow) return;
  await ctx.db.patch("threadMetadata", threadRow._id, {
    totalUsageUsd: threadRow.totalUsageUsd + costUsd,
    lastMessageTime: Date.now(),
  });
}
