import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Migrations ponctuelles, lancées à la main depuis le dashboard Convex.
// Pas de composant @convex-dev/migrations : chacune est une mutation interne
// paginée et IDEMPOTENTE, donc rejouable sans risque.

// ── backfillNodeDataTemplateId ──────────────────────────────────────────
//
// La mutation publique `nodeDatas.create` acceptait `templateId` dans ses
// arguments puis ne le transmettait pas au modèle. Tous les custom nodes créés
// depuis le front sont donc dépourvus de ce lien — invisible sur le canvas,
// qui résout par la copie dénormalisée `canvasNodes[].data.templateId`, mais
// bloquant pour la window ET pour la validation des values à l'écriture, qui
// est conditionnée à sa présence.
//
// La correspondance vit sur le canvas : chaque node y porte à la fois son
// `nodeDataId` et sa copie `data.templateId`. On répare depuis cette copie.
//
// Lancer sans argument, puis rappeler avec le `cursor` rendu tant que
// `isDone` est faux.
export const backfillNodeDataTemplateId = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    isDone: v.boolean(),
    cursor: v.union(v.string(), v.null()),
    canvasesScanned: v.number(),
    patched: v.number(),
    // Nodes de canvas porteurs d'un templateId dont le nodeData est
    // introuvable : signalés plutôt que tus, c'est le signe d'une donnée
    // incohérente que cette migration ne sait pas réparer.
    orphanNodeDatas: v.number(),
  }),
  handler: async (ctx, { cursor, batchSize }) => {
    const page = await ctx.db
      .query("canvases")
      .paginate({ cursor: cursor ?? null, numItems: batchSize ?? 20 });

    let patched = 0;
    let orphanNodeDatas = 0;

    for (const canvas of page.page) {
      for (const node of canvas.nodes ?? []) {
        if (node.type !== "custom") continue;

        const templateId = node.data?.templateId as
          | Id<"nodeTemplates">
          | undefined;
        if (!templateId || !node.nodeDataId) continue;

        const nodeData = await ctx.db.get(node.nodeDataId);
        if (!nodeData) {
          orphanNodeDatas += 1;
          continue;
        }
        // Idempotence : on ne touche que ce qui manque. Une valeur déjà
        // présente fait autorité et n'est jamais écrasée par la copie.
        if (nodeData.templateId) continue;

        await ctx.db.patch(node.nodeDataId, { templateId });
        patched += 1;
      }
    }

    return {
      isDone: page.isDone,
      cursor: page.continueCursor,
      canvasesScanned: page.page.length,
      patched,
      orphanNodeDatas,
    };
  },
});

// Compte les custom nodes encore dépourvus de templateId. Sert à vérifier
// avant/après le backfill — et à confirmer que le correctif d'écriture tient
// dans le temps (le compte doit rester à zéro).
export const countCustomNodeDatasWithoutTemplate = internalMutation({
  args: {},
  returns: v.object({ total: v.number(), missing: v.number() }),
  handler: async (ctx) => {
    const all = await ctx.db
      .query("nodeDatas")
      .filter((q) => q.eq(q.field("type"), "custom"))
      .collect();
    return {
      total: all.length,
      missing: all.filter((nd) => !nd.templateId).length,
    };
  },
});
