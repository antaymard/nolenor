/**
 * Nettoyages ponctuels de données rendues invalides par un changement de
 * schéma. Une migration jouée jusqu'au bout peut être retirée de ce fichier.
 *
 * Historique (jouées partout, code supprimé) :
 * - `dropAttachedPages` : retirait `attachments.page` de `messageMetadata`.
 * - `dropCanvasViewportArrays` : retirait `slideshows` / `hotspots` de
 *   `canvases` (remplacés par le node `viewport`).
 * - `migrateImageReferencesToBool` : convertissait `values.imageReferences`
 *   (tableau de nodeDataIds) vers `values.imageIncludeReferences` (bool,
 *   défaut `true`), puis supprimait l'ancien champ.
 *
 * Patron pour la prochaine fois : une `internalMutation` paginée par lots
 * (cf. `ctx.db.query(...).paginate({ numItems: 200, cursor })`) qui se
 * replanifie via `ctx.scheduler.runAfter(0, internal.migrations.maMigration, …)`
 * tant que `isDone` est faux, à lancer avec
 * `npx convex run migrations:maMigration '{}'` AVANT de pousser le schéma
 * nettoyé.
 */

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Backfill `canvases.nodes` embarqués → table `nodes` ( additive, idempotent ).
 *
 * - Préserve les `id` (llmId) tels quels : les edges et mentions les
 *   référencent comme chaînes, aucun remap.
 * - Nodes sans `nodeDataId` : sautés + comptés (la table l'exige en requis,
 *   l'embarqué l'a en optionnel). À traiter à la main via le rapport.
 * - Conflit `by_llmid` (même id, canvas/nodeData différent) : sauté + rapporté,
 *   jamais remappé en silence (un remap casserait les edges).
 * - Ne supprime PAS l'embarqué : le front le lit encore. Le prune est une
 *   étape ultérieure, une fois la double-lecture en place.
 *
 * Usage :
 *   npx convex run migrations:backfillNodesFromCanvases '{"dryRun": true}'
 *   npx convex run migrations:backfillNodesFromCanvases '{}'
 */
export const backfillNodesFromCanvases = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    migrated: v.number(),
    skippedExisting: v.number(),
    skippedNoNodeData: v.number(),
    conflictCount: v.number(),
    conflicts: v.array(v.string()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const page = await ctx.db
      .query("canvases")
      .order("asc")
      .paginate({ numItems: 25, cursor: args.cursor ?? null });

    let migrated = 0;
    let skippedExisting = 0;
    let skippedNoNodeData = 0;
    const conflicts: Array<string> = [];

    for (const canvas of page.page) {
      for (const node of canvas.nodes ?? []) {
        if (!node.nodeDataId) {
          skippedNoNodeData++;
          continue;
        }
        const existing = await ctx.db
          .query("nodes")
          .withIndex("by_llmid", (q) => q.eq("id", node.id))
          .first();
        if (existing) {
          if (
            existing.canvasId === canvas._id &&
            existing.nodeDataId === node.nodeDataId
          ) {
            skippedExisting++;
          } else if (conflicts.length < 50) {
            conflicts.push(
              `id ${node.id} (canvas ${canvas._id}) déjà pris par canvas ${existing.canvasId}`,
            );
          }
          continue;
        }
        if (!dryRun) {
          const { id: _id, nodeDataId: _nd, ...rest } = node;
          await ctx.db.insert("nodes", {
            ...rest,
            id: node.id,
            canvasId: canvas._id,
            nodeDataId: node.nodeDataId,
          });
        }
        migrated++;
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.backfillNodesFromCanvases,
        { cursor: page.continueCursor, dryRun },
      );
    }

    return {
      migrated,
      skippedExisting,
      skippedNoNodeData,
      conflictCount: conflicts.length,
      conflicts,
      isDone: page.isDone,
    };
  },
});
