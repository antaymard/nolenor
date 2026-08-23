import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Nettoyages ponctuels de données rendues invalides par un changement de
 * schéma. Une migration jouée jusqu'au bout peut être retirée de ce fichier.
 */

// Volontairement modeste : la mutation se replanifie tant qu'il reste des
// pages, plutôt que de tenter une passe unique qui dépasserait les limites de
// transaction sur une grosse table.
const BATCH_SIZE = 200;

type DropAttachedPagesResult = {
  scanned: number;
  cleaned: number;
  isDone: boolean;
};

/**
 * Retire `attachments.page` des métadonnées de message. Ce champ n'était
 * alimenté que par l'extension navigateur, supprimée du repo : tant qu'un
 * document le porte, pousser le schéma sans ce champ échoue à la validation.
 *
 * À lancer sur le déploiement *avant* de pousser le schéma nettoyé :
 * `npx convex run migrations:dropAttachedPages '{}'`
 * L'appel traite un lot puis se replanifie seul jusqu'à la fin de la table.
 */
export const dropAttachedPages = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    scanned: v.number(),
    cleaned: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { cursor }): Promise<DropAttachedPagesResult> => {
    const results = await ctx.db
      .query("messageMetadata")
      .paginate({ numItems: BATCH_SIZE, cursor: cursor ?? null });

    let cleaned = 0;
    for (const doc of results.page) {
      // `page` sort du schéma : les documents antérieurs le portent encore, on
      // le lit donc hors des types générés.
      const raw = doc.attachments as Record<string, unknown> | undefined;
      if (!raw || raw.page === undefined) continue;

      const { nodes, position } = doc.attachments ?? {};
      const keepsAttachments =
        (nodes !== undefined && nodes.length > 0) || position !== undefined;

      // `patch` remplace `attachments` en entier : la clé `page` disparaît.
      await ctx.db.patch("messageMetadata", doc._id, {
        attachments: keepsAttachments ? { nodes, position } : undefined,
      });
      cleaned += 1;
    }

    if (!results.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.dropAttachedPages, {
        cursor: results.continueCursor,
      });
    }

    return { scanned: results.page.length, cleaned, isDone: results.isDone };
  },
});

type DropTouchedNodeDataIdsResult = {
  scanned: number;
  cleaned: number;
  isDone: boolean;
};

/**
 * Retire `touchedNodeDataIds` des métadonnées de thread. C'était le premier jet
 * du lien thread → nodes : un tableau d'ids plat, où une suppression était
 * indiscernable d'une édition. Remplacé par `touchedNodes`, qui porte un verbe.
 *
 * À lancer sur le déploiement *avant* de pousser le schéma nettoyé :
 * `npx convex run migrations:dropTouchedNodeDataIds '{}'`
 * L'appel traite un lot puis se replanifie seul jusqu'à la fin de la table.
 */
export const dropTouchedNodeDataIds = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    scanned: v.number(),
    cleaned: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { cursor }): Promise<DropTouchedNodeDataIdsResult> => {
    const results = await ctx.db
      .query("threadMetadata")
      .paginate({ numItems: BATCH_SIZE, cursor: cursor ?? null });

    let cleaned = 0;
    for (const doc of results.page) {
      if (doc.touchedNodeDataIds === undefined) continue;
      await ctx.db.patch("threadMetadata", doc._id, {
        touchedNodeDataIds: undefined,
      });
      cleaned += 1;
    }

    if (!results.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.dropTouchedNodeDataIds,
        { cursor: results.continueCursor },
      );
    }

    return { scanned: results.page.length, cleaned, isDone: results.isDone };
  },
});
