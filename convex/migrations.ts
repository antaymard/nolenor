import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import * as SkillModels from "./models/skillModels";

/**
 * One-shot purge of legacy system skills (and their attachments) from the DB.
 * System skills now live in the code (convex/systemSkills/), so any leftover
 * `isSystem: true` rows would create duplicates in <available_skills>.
 *
 * Run with: `npx convex run migrations:purgeLegacySystemSkills`
 */
export const purgeLegacySystemSkills = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("skills")
      .withIndex("by_isSystem", (q) => q.eq("isSystem", true))
      .collect();

    for (const row of rows) {
      await SkillModels.deleteSkillCascade(ctx, { skillId: row._id });
    }

    return { deleted: rows.length };
  },
});

/**
 * Champs "automation" hérités à retirer de `nodeDatas`. Tous déclarés
 * `v.optional(v.any())` dans le schéma, donc les patcher à `undefined` les
 * supprime du document sans risque.
 */
const AUTOMATION_FIELDS = [
  "status",
  "automationProgress",
  "agent",
  "dataProcessing",
  "automationMode",
  "dependencies",
] as const;

/**
 * Vide les champs automation (status, automationProgress, agent, dataProcessing,
 * automationMode, dependencies) de tous les docs `nodeDatas`.
 *
 * Paginé + auto-planifié : chaque exécution traite une page puis planifie la
 * suivante via le scheduler pour ne pas dépasser les limites d'une transaction.
 *
 * Dry run (par défaut, n'écrit rien) :
 *   npx convex run migrations:clearAutomationFields
 * Exécution réelle :
 *   npx convex run migrations:clearAutomationFields '{"dryRun": false}'
 */
export const clearAutomationFields = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { dryRun = true, cursor = null, batchSize = 200 }) => {
    const page = await ctx.db
      .query("nodeDatas")
      .paginate({ cursor, numItems: batchSize });

    let affected = 0;
    for (const doc of page.page) {
      const hasField = AUTOMATION_FIELDS.some(
        (f) => (doc as Record<string, unknown>)[f] !== undefined,
      );
      if (!hasField) continue;
      affected++;
      if (!dryRun) {
        await ctx.db.patch(doc._id, {
          status: undefined,
          automationProgress: undefined,
          agent: undefined,
          dataProcessing: undefined,
          automationMode: undefined,
          dependencies: undefined,
        });
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.clearAutomationFields,
        { dryRun, cursor: page.continueCursor, batchSize },
      );
    }

    console.log(
      `[clearAutomationFields] dryRun=${dryRun} scanned=${page.page.length} affected=${affected} done=${page.isDone}`,
    );
    return { scanned: page.page.length, affected, isDone: page.isDone };
  },
});
