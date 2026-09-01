import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import * as R2ObjectModels from "./models/r2ObjectModels";
import { extractR2Keys } from "./lib/r2Keys";

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

type BackfillR2RefsResult = {
  scanned: number;
  registered: number;
  isDone: boolean;
};

/**
 * Donne leurs lignes `r2Objects` aux nodeDatas antérieurs au comptage de
 * références.
 *
 * La suppression d'un node ne lit que ces lignes — jamais ses values — pour ne
 * jamais retirer un fichier qu'un duplicata utilise encore. Un node qui n'en
 * détient aucune ne libère donc rien : son fichier survit à sa suppression et
 * reste sur R2 indéfiniment. Ce backfill referme cette fuite.
 *
 * N'insère que les lignes manquantes et ne supprime aucun objet : c'est la
 * disparition du dernier référent qui déclenchera la suppression, plus tard et
 * par le chemin normal.
 *
 * `npx convex run migrations:backfillR2Refs '{}'`
 * L'appel traite un lot puis se replanifie seul jusqu'à la fin de la table.
 */
export const backfillR2Refs = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    scanned: v.number(),
    registered: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { cursor }): Promise<BackfillR2RefsResult> => {
    // Plus petit que BATCH_SIZE : un nodeData porte ses `values` (code d'app,
    // document blocknote, table entière), et la transaction lit le document
    // complet de chaque ligne du lot.
    const results = await ctx.db
      .query("nodeDatas")
      .paginate({ numItems: 50, cursor: cursor ?? null });

    // Les custom nodes d'un même canvas partagent quelques templates : on les
    // relit une fois par lot, pas une fois par node.
    const templates = new Map<
      Id<"nodeTemplates">,
      Doc<"nodeTemplates"> | null
    >();

    let registered = 0;
    for (const nodeData of results.page) {
      let template: Doc<"nodeTemplates"> | null = null;
      if (nodeData.templateId) {
        const cached = templates.get(nodeData.templateId);
        template =
          cached !== undefined ? cached : await ctx.db.get(nodeData.templateId);
        templates.set(nodeData.templateId, template);
      }

      const keys = extractR2Keys(nodeData, template);
      if (keys.length === 0) continue;

      registered += await R2ObjectModels.adoptRefs(ctx, {
        nodeDataId: nodeData._id,
        keys,
      });
    }

    if (!results.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillR2Refs, {
        cursor: results.continueCursor,
      });
    }

    return { scanned: results.page.length, registered, isDone: results.isDone };
  },
});
