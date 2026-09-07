import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

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

type DropCanvasViewportArraysResult = {
  scanned: number;
  cleaned: number;
  totalScanned: number;
  totalCleaned: number;
  isDone: boolean;
};

// Les deux champs sortent du schéma, donc des types générés : le patch qui les
// efface ne peut plus se typer contre `Doc<"canvases">`. `undefined` en valeur
// de patch supprime la clé, comme pour `attachments` plus haut.
const DROP_CANVAS_VIEWPORT_FIELDS = {
  slideshows: undefined,
  hotspots: undefined,
} as unknown as Partial<Doc<"canvases">>;

/**
 * Retire `slideshows` et `hotspots` des documents `canvases`. Les deux
 * fonctionnalités sont remplacées par le node `viewport`, qui porte sa position
 * dans ses `values` : tant qu'un document porte l'un de ces champs, pousser le
 * schéma sans eux échoue à la validation.
 *
 * À lancer sur le déploiement *avant* de pousser le schéma nettoyé :
 * `npx convex run migrations:dropCanvasViewportArrays '{}'`
 * L'appel traite un lot puis se replanifie seul jusqu'à la fin de la table.
 */
export const dropCanvasViewportArrays = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    // Totaux portés de lot en lot : `convex run` ne voit que le retour du
    // PREMIER, les suivants sont planifiés.
    totalScanned: v.optional(v.number()),
    totalCleaned: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    cleaned: v.number(),
    totalScanned: v.number(),
    totalCleaned: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (
    ctx,
    { cursor, totalScanned = 0, totalCleaned = 0 },
  ): Promise<DropCanvasViewportArraysResult> => {
    const results = await ctx.db
      .query("canvases")
      .paginate({ numItems: BATCH_SIZE, cursor: cursor ?? null });

    let cleaned = 0;
    for (const canvas of results.page) {
      // Champs hors schéma : ils se lisent hors des types générés.
      const raw = canvas as unknown as Record<string, unknown>;
      if (raw.slideshows === undefined && raw.hotspots === undefined) continue;

      await ctx.db.patch("canvases", canvas._id, DROP_CANVAS_VIEWPORT_FIELDS);
      cleaned += 1;
    }

    const scanned = results.page.length;
    const nextScanned = totalScanned + scanned;
    const nextCleaned = totalCleaned + cleaned;

    if (results.isDone) {
      console.log(
        `[dropCanvasViewportArrays] terminé : ${nextScanned} canvases parcourus, ${nextCleaned} nettoyés.`,
      );
    } else {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.dropCanvasViewportArrays,
        {
          cursor: results.continueCursor,
          totalScanned: nextScanned,
          totalCleaned: nextCleaned,
        },
      );
    }

    return {
      scanned,
      cleaned,
      totalScanned: nextScanned,
      totalCleaned: nextCleaned,
      isDone: results.isDone,
    };
  },
});
