import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { AiUsageSource } from "../schemas/aiUsageSourceSchema";
import type { AiUsageTokens } from "../schemas/aiUsageTokensSchema";
import { utcDayKey } from "../lib/usageDay";
import * as ThreadMetadataModels from "./threadMetadataModels";

type AiUsageDaily = Doc<"aiUsageDaily">;
type AiUsageEvent = Doc<"aiUsageEvents">;

/**
 * Borne de lecture du rollup. Le nombre de modèles distincts par jour est borné
 * par la liste de `chatModelOptions` (5) plus le modèle worker et le modèle
 * rapide, soit 7 au pire ; sur 366 jours ça plafonne autour de 2 500 lignes,
 * loin des limites de transaction. La borne est là pour que l'ajout futur d'un
 * modèle ne transforme pas cette query en scan non maîtrisé.
 */
export const MAX_DAILY_ROWS = 4000;

/** Fenêtre maximale demandable en une fois (bornes incluses). */
export const MAX_PERIOD_DAYS = 366;

/** Rétention du ledger. Le rollup, lui, n'est jamais purgé. */
export const AI_USAGE_EVENTS_RETENTION_MS = 180 * 86_400_000;

export type RecordUsageArgs = {
  source: AiUsageSource;
  /**
   * Tel que fourni par le composant agent : une chaîne nue, pas un
   * `Id<"users">`. La normalisation se fait ici.
   */
  userId?: string;
  threadId?: string;
  agentName?: string;
  model: string;
  provider: string;
  /** Absent quand OpenRouter n'a renvoyé aucun coût. */
  costUsd?: number;
  upstreamCostUsd?: number;
  tokens: AiUsageTokens;
};

/**
 * Enregistre la consommation d'un step LLM : insert du ledger, upsert du rollup
 * journalier et report sur le total du thread, le tout dans la même
 * transaction. Les faire ensemble est ce qui rend structurellement impossible
 * une dérive entre `threadMetadata.totalUsageUsd` et la somme du ledger.
 *
 * Ne throw jamais pour une donnée manquante : l'appelant est un `usageHandler`
 * qui s'exécute après que la réponse a déjà été streamée à l'utilisateur.
 */
export async function recordUsage(
  ctx: MutationCtx,
  args: RecordUsageArgs,
): Promise<null> {
  // Une seule lecture du thread, deux usages : le repli sur son `userId` et la
  // dénormalisation de son `canvasId`.
  const threadRow = args.threadId
    ? await ThreadMetadataModels.findByThreadId(ctx, { threadId: args.threadId })
    : null;

  const userId = resolveUserId(ctx, args.userId) ?? threadRow?.userId ?? null;
  if (!userId) {
    // Une ligne sans propriétaire ne pourra jamais s'afficher sur un dashboard
    // par utilisateur : l'écrire serait pire que la jeter.
    console.error("[aiUsage] impossible de résoudre l'utilisateur, event ignoré", {
      source: args.source,
      model: args.model,
      threadId: args.threadId,
    });
    return null;
  }

  const day = utcDayKey(Date.now());

  await ctx.db.insert("aiUsageEvents", {
    userId,
    day,
    source: args.source,
    agentName: args.agentName,
    model: args.model,
    provider: args.provider,
    threadId: args.threadId,
    canvasId: threadRow?.canvasId,
    costUsd: args.costUsd,
    upstreamCostUsd: args.upstreamCostUsd,
    ...args.tokens,
  });

  await upsertDaily(ctx, { userId, day, model: args.model, args });

  await ThreadMetadataModels.addUsage(ctx, {
    threadRow,
    costUsd: args.costUsd ?? 0,
  });

  return null;
}

/**
 * `normalizeId` plutôt que `ctx.db.get(id as Id<"users">)` : le composant agent
 * transmet une chaîne nue, et `get` throw sur un id malformé là où
 * `normalizeId` renvoie simplement `null`.
 */
function resolveUserId(
  ctx: MutationCtx,
  userId: string | undefined,
): Id<"users"> | null {
  if (!userId) return null;
  return ctx.db.normalizeId("users", userId);
}

async function upsertDaily(
  ctx: MutationCtx,
  {
    userId,
    day,
    model,
    args,
  }: {
    userId: Id<"users">;
    day: string;
    model: string;
    args: RecordUsageArgs;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("aiUsageDaily")
    .withIndex("by_userId_and_day_and_model", (q) =>
      q.eq("userId", userId).eq("day", day).eq("model", model),
    )
    .unique();

  const costUsd = args.costUsd ?? 0;
  const upstreamCostUsd = args.upstreamCostUsd ?? 0;
  // Le coût absent est compté à part plutôt que sommé comme un zéro : c'est ce
  // qui permet ensuite de distinguer « gratuit » de « pas d'info ».
  const missingCost = args.costUsd === undefined ? 1 : 0;
  const { tokens } = args;

  if (!existing) {
    await ctx.db.insert("aiUsageDaily", {
      userId,
      day,
      model,
      costUsd,
      upstreamCostUsd,
      eventsCount: 1,
      eventsMissingCostCount: missingCost,
      ...tokens,
    });
    return;
  }

  await ctx.db.patch("aiUsageDaily", existing._id, {
    costUsd: existing.costUsd + costUsd,
    upstreamCostUsd: existing.upstreamCostUsd + upstreamCostUsd,
    eventsCount: existing.eventsCount + 1,
    eventsMissingCostCount: existing.eventsMissingCostCount + missingCost,
    inputTokens: existing.inputTokens + tokens.inputTokens,
    cachedInputTokens: existing.cachedInputTokens + tokens.cachedInputTokens,
    cacheWriteTokens: existing.cacheWriteTokens + tokens.cacheWriteTokens,
    outputTokens: existing.outputTokens + tokens.outputTokens,
    reasoningTokens: existing.reasoningTokens + tokens.reasoningTokens,
    totalTokens: existing.totalTokens + tokens.totalTokens,
  });
}

/**
 * Lignes de rollup d'un utilisateur sur une plage de journées, bornes incluses.
 * Lit une ligne de plus que la borne pour pouvoir signaler la troncature au
 * lieu de la masquer.
 */
export async function listDailyRange(
  ctx: QueryCtx,
  {
    userId,
    fromDay,
    toDay,
  }: { userId: Id<"users">; fromDay: string; toDay: string },
): Promise<{ rows: AiUsageDaily[]; truncated: boolean }> {
  const rows = await ctx.db
    .query("aiUsageDaily")
    .withIndex("by_userId_and_day_and_model", (q) =>
      q.eq("userId", userId).gte("day", fromDay).lte("day", toDay),
    )
    .take(MAX_DAILY_ROWS + 1);

  return {
    rows: rows.slice(0, MAX_DAILY_ROWS),
    truncated: rows.length > MAX_DAILY_ROWS,
  };
}

/** Événements bruts d'une journée, du plus récent au plus ancien. */
export function dayEventsQuery(
  ctx: QueryCtx,
  { userId, day }: { userId: Id<"users">; day: string },
) {
  return ctx.db
    .query("aiUsageEvents")
    .withIndex("by_userId_and_day", (q) =>
      q.eq("userId", userId).eq("day", day),
    )
    .order("desc");
}

/**
 * Un lot d'événements dépassant la rétention. Passe par l'index intégré
 * `by_creation_time` : aucun index supplémentaire à déclarer.
 */
export async function listExpiredEvents(
  ctx: QueryCtx,
  { olderThan, limit }: { olderThan: number; limit: number },
): Promise<AiUsageEvent[]> {
  return await ctx.db
    .query("aiUsageEvents")
    .withIndex("by_creation_time", (q) => q.lt("_creationTime", olderThan))
    .take(limit);
}
