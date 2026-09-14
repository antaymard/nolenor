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
 * - `backfillNodesFromCanvases` / `backfillEdgesFromCanvases` : copiaient les
 *   nodes/edges embarqués (`canvases.nodes` / `canvases.edges`) vers les
 *   tables dédiées `nodes` / `edges`, llmIds préservés, idempotents.
 * - `stripNodesFromCanvases` / `stripEdgesFromCanvases` : retiraient les
 *   champs embarqués des docs canvas (dégonflement) après bascule des
 *   writers, condition préalable au prune des champs dans `canvasesSchema`
 *   (oct. 2026).
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
 * `searchableChunks.nodeId` : étape 2/2 de la séparation node (canvas) /
 * data (nodeData, chunks). Depuis `d457dec` plus personne n'écrit ni ne lit
 * ce champ — le rattachement visuel se résout à la lecture via `nodeDataId`
 * (cf. `resolveNodeIds`). Restent les valeurs stockées sur les chunks créés
 * avant la bascule, qui bloquent le prune du champ dans `searchableChunksSchema`
 * (la validation de schéma à la poussée refuse un champ absent du validateur).
 *
 * À jouer AVANT de pousser le schéma nettoyé :
 *   npx convex run migrations:stripNodeIdFromChunks '{"dryRun": true}'
 *   npx convex run migrations:stripNodeIdFromChunks '{}'
 *
 * Pas de curseur : on balaie l'index `by_nodeId` sur la seule plage des
 * chunks qui portent encore une chaîne (`undefined` trie avant toute string,
 * donc hors plage). Chaque patch sort le document de la plage, la fenêtre se
 * vide toute seule et une reprise après interruption repart d'où elle en
 * était. Lot volontairement petit : un chunk de page PDF porte tout son
 * markdown, 50 documents suffisent à rester loin de la limite de lecture.
 */
const STRIP_NODE_ID_BATCH = 50;

export const stripNodeIdFromChunks = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    totalStripped: v.optional(v.number()),
  },
  returns: v.object({
    stripped: v.number(),
    totalStripped: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const previousTotal = args.totalStripped ?? 0;

    const batch = await ctx.db
      .query("searchableChunks")
      .withIndex("by_nodeId", (q) => q.gte("nodeId", ""))
      .take(STRIP_NODE_ID_BATCH);

    // En dry-run rien n'est patché : la plage ne se vide pas, donc on ne se
    // replanifie jamais. Le lot lu sert seulement à confirmer qu'il reste
    // (ou non) des chunks à nettoyer.
    if (dryRun) {
      console.log("[migrations] stripNodeIdFromChunks:dry-run", {
        pending: batch.length,
        batchSize: STRIP_NODE_ID_BATCH,
      });
      return {
        stripped: 0,
        totalStripped: previousTotal,
        isDone: batch.length === 0,
      };
    }

    for (const chunk of batch) {
      await ctx.db.patch("searchableChunks", chunk._id, { nodeId: undefined });
    }

    const totalStripped = previousTotal + batch.length;
    const isDone = batch.length < STRIP_NODE_ID_BATCH;

    console.log("[migrations] stripNodeIdFromChunks:batch", {
      stripped: batch.length,
      totalStripped,
      isDone,
    });

    if (!isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.stripNodeIdFromChunks,
        { totalStripped },
      );
    }

    return { stripped: batch.length, totalStripped, isDone };
  },
});
