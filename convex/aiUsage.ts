import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth } from "./lib/auth";
import errors from "./config/errorsConfig";
import { daysInRange, isValidDayKey } from "./lib/usageDay";
import * as AiUsageModels from "./models/aiUsageModels";

const vDayTotals = v.object({
  day: v.string(),
  costUsd: v.number(),
  totalTokens: v.number(),
  eventsCount: v.number(),
  eventsMissingCostCount: v.number(),
});

const vModelTotals = v.object({
  model: v.string(),
  costUsd: v.number(),
  inputTokens: v.number(),
  cachedInputTokens: v.number(),
  outputTokens: v.number(),
  reasoningTokens: v.number(),
  totalTokens: v.number(),
  eventsCount: v.number(),
  eventsMissingCostCount: v.number(),
});

/**
 * Consommation IA de l'utilisateur courant sur une plage de journées UTC,
 * bornes incluses : total de la période, découpage jour par jour et par modèle.
 *
 * La plage est un argument et non un `Date.now()` interne : une query qui lit
 * l'horloge n'est jamais réévaluée quand le temps avance, et elle casse le
 * cache. C'est au client de rafraîchir la fenêtre.
 */
export const getDailyUsage = query({
  args: {
    fromDay: v.string(),
    toDay: v.string(),
  },
  returns: v.object({
    fromDay: v.string(),
    toDay: v.string(),
    totalCostUsd: v.number(),
    totalTokens: v.number(),
    eventsCount: v.number(),
    eventsMissingCostCount: v.number(),
    truncated: v.boolean(),
    // Creux : seules les journées ayant consommé. Le remplissage à zéro se fait
    // côté client, qui connaît déjà la plage qu'il a demandée.
    days: v.array(vDayTotals),
    // Trié par coût décroissant.
    byModel: v.array(vModelTotals),
  }),
  handler: async (ctx, { fromDay, toDay }) => {
    const authUserId = await requireAuth(ctx);

    if (
      !isValidDayKey(fromDay) ||
      !isValidDayKey(toDay) ||
      // Comparaison de chaînes : le format ISO à largeur fixe rend l'ordre
      // lexicographique équivalent à l'ordre chronologique.
      fromDay > toDay ||
      daysInRange(fromDay, toDay) > AiUsageModels.MAX_PERIOD_DAYS
    ) {
      throw new ConvexError(errors.INVALID_USAGE_PERIOD);
    }

    const { rows, truncated } = await AiUsageModels.listDailyRange(ctx, {
      userId: authUserId,
      fromDay,
      toDay,
    });

    const byDay = new Map<string, typeof vDayTotals.type>();
    const byModel = new Map<string, typeof vModelTotals.type>();
    let totalCostUsd = 0;
    let totalTokens = 0;
    let eventsCount = 0;
    let eventsMissingCostCount = 0;

    for (const row of rows) {
      totalCostUsd += row.costUsd;
      totalTokens += row.totalTokens;
      eventsCount += row.eventsCount;
      eventsMissingCostCount += row.eventsMissingCostCount;

      const day = byDay.get(row.day) ?? {
        day: row.day,
        costUsd: 0,
        totalTokens: 0,
        eventsCount: 0,
        eventsMissingCostCount: 0,
      };
      day.costUsd += row.costUsd;
      day.totalTokens += row.totalTokens;
      day.eventsCount += row.eventsCount;
      day.eventsMissingCostCount += row.eventsMissingCostCount;
      byDay.set(row.day, day);

      const model = byModel.get(row.model) ?? {
        model: row.model,
        costUsd: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        eventsCount: 0,
        eventsMissingCostCount: 0,
      };
      model.costUsd += row.costUsd;
      model.inputTokens += row.inputTokens;
      model.cachedInputTokens += row.cachedInputTokens;
      model.outputTokens += row.outputTokens;
      model.reasoningTokens += row.reasoningTokens;
      model.totalTokens += row.totalTokens;
      model.eventsCount += row.eventsCount;
      model.eventsMissingCostCount += row.eventsMissingCostCount;
      byModel.set(row.model, model);
    }

    return {
      fromDay,
      toDay,
      totalCostUsd,
      totalTokens,
      eventsCount,
      eventsMissingCostCount,
      truncated,
      days: Array.from(byDay.values()).sort((a, b) =>
        a.day < b.day ? -1 : a.day > b.day ? 1 : 0,
      ),
      byModel: Array.from(byModel.values()).sort(
        (a, b) => b.costUsd - a.costUsd,
      ),
    };
  },
});

/**
 * Détail brut d'une journée. C'est ce qui rend « pourquoi ce jour affiche ce
 * montant ? » et surtout « quels appels n'ont pas de coût ? » répondables sans
 * ouvrir le dashboard Convex.
 */
export const listDayEvents = query({
  args: {
    day: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { day, paginationOpts }) => {
    const authUserId = await requireAuth(ctx);
    if (!isValidDayKey(day)) {
      throw new ConvexError(errors.INVALID_USAGE_PERIOD);
    }

    return await AiUsageModels.dayEventsQuery(ctx, {
      userId: authUserId,
      day,
    }).paginate(paginationOpts);
  },
});

// Taille de lot de la purge. Volontairement modeste : la mutation se
// replanifie tant qu'il reste des lignes, plutôt que de tenter une passe unique
// qui dépasserait les limites de transaction sur une grosse table.
const PRUNE_BATCH_SIZE = 200;

/**
 * Purge du ledger au-delà de la rétention. Le rollup journalier, lui, n'est
 * jamais purgé : les totaux par jour et par modèle survivent indéfiniment,
 * seule la piste d'audit au step s'efface.
 */
export const pruneExpiredEvents = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const olderThan = Date.now() - AiUsageModels.AI_USAGE_EVENTS_RETENTION_MS;
    const expired = await AiUsageModels.listExpiredEvents(ctx, {
      olderThan,
      limit: PRUNE_BATCH_SIZE,
    });

    for (const event of expired) {
      await ctx.db.delete("aiUsageEvents", event._id);
    }

    if (expired.length === PRUNE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.aiUsage.pruneExpiredEvents, {});
    }

    return null;
  },
});
