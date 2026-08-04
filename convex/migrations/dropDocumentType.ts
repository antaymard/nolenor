// Module jetable : purge les dernières lignes portant `nodeType: "document"`
// pour pouvoir retirer ce littéral de `nodeTypeValidator`.
//
// `nodeTypeValidator` contraint quatre champs (`nodeDatas.type`,
// `canvases.nodes[].type`, `searchableChunks.nodeType`,
// `nodeDataVersions.nodeType`). La migration PlateJS -> BlockNote a converti
// les trois premiers, mais pas les versions dont la conversion avait échoué —
// ni le checkpoint final créé à la suppression des documents irrécupérables.
// Elles disparaîtraient d'elles-mêmes à l'expiration de leur TTL de 30 jours ;
// on n'attend pas.
//
// À supprimer avec le littéral, une fois `countRemaining` à zéro partout.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

const BATCH_SIZE = 200;

export const countRemaining = internalQuery({
  args: {},
  returns: v.object({
    nodeDatas: v.number(),
    canvasNodes: v.number(),
    searchableChunks: v.number(),
    nodeDataVersions: v.number(),
  }),
  handler: async (ctx) => {
    const nodeDatas = await ctx.db.query("nodeDatas").collect();
    const canvases = await ctx.db.query("canvases").collect();
    const chunks = await ctx.db.query("searchableChunks").collect();
    const versions = await ctx.db.query("nodeDataVersions").collect();

    return {
      nodeDatas: nodeDatas.filter((row) => row.type === "document").length,
      canvasNodes: canvases.reduce(
        (total, canvas) =>
          total +
          (canvas.nodes ?? []).filter((node) => node.type === "document")
            .length,
        0,
      ),
      searchableChunks: chunks.filter((row) => row.nodeType === "document")
        .length,
      nodeDataVersions: versions.filter((row) => row.nodeType === "document")
        .length,
    };
  },
});

// Supprime un lot puis se re-schedule tant qu'un lot est plein, comme
// `pruneExpiredBatch`. Ni `nodeDataVersions` ni `searchableChunks` n'ont
// d'index sur `nodeType`, d'où le filtre en mémoire : le volume résiduel est
// de l'ordre de la dizaine de lignes.
export const purge = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const versions = await ctx.db
      .query("nodeDataVersions")
      .filter((q) => q.eq(q.field("nodeType"), "document"))
      .take(BATCH_SIZE);

    for (const version of versions) {
      await ctx.db.delete(version._id);
    }

    const chunks = await ctx.db
      .query("searchableChunks")
      .filter((q) => q.eq(q.field("nodeType"), "document"))
      .take(BATCH_SIZE);

    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    if (versions.length === BATCH_SIZE || chunks.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.dropDocumentType.purge,
        {},
      );
    }

    return null;
  },
});
