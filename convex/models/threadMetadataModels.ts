import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  RUN_ERROR_MAX_LENGTH,
  threadAgentNames,
  threadRunStatuses,
  type ThreadRunEndStatus,
} from "../schemas/threadMetadataSchema";

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

/**
 * Marque le début d'un tour, et date l'interaction.
 *
 * La comptabilité d'usage ne stampe `lastMessageTime` qu'une fois l'assistant
 * passé ; on veut aussi dater l'envoi, sinon un tour qui échoue laisse le
 * thread paraître plus vieux qu'il ne l'est. C'est aussi ici, et pas dans la
 * comptabilité de coût, qu'on incrémente `roundsNb` : le `usageHandler` du
 * composant agent est appelé une fois par step LLM, donc y compter les rounds
 * revenait à compter des steps.
 *
 * Renvoie le `runStartedAt` écrit — le jeton que `markRunEnded` exigera pour
 * conclure ce tour-là, et pas un autre parti entre-temps. `null` quand le
 * thread n'a pas de ligne de metadata (rien à conclure non plus).
 */
export async function markRunStarted(
  ctx: MutationCtx,
  { threadId }: { threadId: string },
): Promise<number | null> {
  const threadRow = await findByThreadId(ctx, { threadId });
  if (!threadRow) return null;

  const runStartedAt = Date.now();
  await ctx.db.patch("threadMetadata", threadRow._id, {
    lastMessageTime: runStartedAt,
    roundsNb: (threadRow.roundsNb ?? 0) + 1,
    runStatus: threadRunStatuses.running,
    runStartedAt,
    runEndedAt: undefined,
    lastRunError: undefined,
  });
  return runStartedAt;
}

/**
 * Sort le thread de `running`.
 *
 * `runToken` est le `runStartedAt` rendu par `markRunStarted` : sans lui, la
 * fin du tour N remettrait le thread au repos alors que le tour N+1, parti
 * entre-temps, tourne encore. On ne conclut donc que le tour qu'on a soi-même
 * ouvert.
 *
 * No-op silencieux quand la ligne n'existe pas : la traçabilité ne doit jamais
 * faire échouer un tour dont la réponse est déjà partie — même prudence que
 * `addUsage`.
 */
export async function markRunEnded(
  ctx: MutationCtx,
  {
    threadId,
    status,
    runToken,
    errorMessage,
  }: {
    threadId: string;
    status: ThreadRunEndStatus;
    runToken?: number;
    errorMessage?: string;
  },
): Promise<void> {
  const threadRow = await findByThreadId(ctx, { threadId });
  if (!threadRow) return;
  if (runToken !== undefined && threadRow.runStartedAt !== runToken) return;

  await ctx.db.patch("threadMetadata", threadRow._id, {
    runStatus: status,
    runEndedAt: Date.now(),
    lastRunError: errorMessage
      ? errorMessage.slice(0, RUN_ERROR_MAX_LENGTH)
      : undefined,
  });
}

/**
 * Enregistre qu'un node a été modifié par l'agent au cours de ce thread.
 *
 * Appelé depuis les wrappers de nodeDatas, à chaque write — et non depuis
 * `maybeCheckpoint`, qui coalesce les écritures d'un même acteur sur 15 min et
 * laisserait donc le lien troué. Dédupliqué, et no-op silencieux si la ligne
 * manque (threads de sous-agents, écritures MCP sans threadId).
 */
export async function addTouchedNode(
  ctx: MutationCtx,
  { threadId, nodeDataId }: { threadId: string; nodeDataId: Id<"nodeDatas"> },
): Promise<void> {
  const threadRow = await findByThreadId(ctx, { threadId });
  if (!threadRow) return;

  const touched = threadRow.touchedNodeDataIds ?? [];
  if (touched.includes(nodeDataId)) return;

  await ctx.db.patch("threadMetadata", threadRow._id, {
    touchedNodeDataIds: [...touched, nodeDataId],
  });
}
