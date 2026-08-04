// Suppression complète d'un ou plusieurs nodes, adressés par `nodeDataId`.
//
// Le chemin utilisateur normal est `canvasNodes.remove`, qui prend des ids de
// nodes de CANVAS et s'appuie sur React Flow côté client pour retirer d'abord
// les arêtes connectées. Quand on n'a que le `nodeDataId` — un échec de
// migration repéré dans un rapport, un node inatteignable dans l'interface —
// il n'y a pas d'équivalent. C'est ce que fournit ce fichier.
//
// La cascade sur les données (chunks, memories, fichiers R2, snapshot final)
// n'est PAS réimplémentée : elle réutilise `deleteNodeDataWithCascade`, le même
// code que le chemin utilisateur. Ce module n'ajoute que ce que cette cascade
// ne couvre pas, parce que c'est normalement le client qui s'en charge :
// l'entrée dans le tableau `nodes` du canvas, les arêtes qui la touchent, et
// les nodes enfants qui la référencent via `parentId`.
//
// Fonction INTERNE : lançable uniquement via `npx convex run`, jamais depuis
// l'application.
//
//   # Aperçu, sans rien supprimer — vérifier les titres avant d'agir
//   npx convex run admin/purgeNodeDatas:purge \
//     '{"nodeDataIds": ["k17..."], "dryRun": true}' --prod
//
//   # Suppression
//   npx convex run admin/purgeNodeDatas:purge \
//     '{"nodeDataIds": ["k17..."]}' --prod

import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { getNodeDataTitle } from "../lib/getNodeDataTitle";
import * as NodeDataModels from "../models/nodeDataModels";

const purgedValidator = v.object({
  nodeDataId: v.string(),
  canvasId: v.string(),
  type: v.string(),
  title: v.string(),
  /** Absent si le nodeData n'est plus posé sur son canvas. */
  canvasNodeId: v.optional(v.string()),
  chunks: v.number(),
  memories: v.number(),
  versions: v.number(),
  edgesRemoved: v.number(),
  childrenDetached: v.number(),
});

export const purge = internalMutation({
  args: {
    nodeDataIds: v.array(v.id("nodeDatas")),
    /** Rapport complet sans aucune écriture. */
    dryRun: v.optional(v.boolean()),
    /**
     * Par défaut les versions SURVIVENT au node, comme sur le chemin
     * utilisateur : elles font office de corbeille et sont purgées par le TTL
     * de 30 jours (cron `nodeDataVersions.pruneExpired`). Passer `true` pour
     * une suppression sans filet.
     */
    purgeVersions: v.optional(v.boolean()),
  },
  returns: v.object({
    dryRun: v.boolean(),
    purged: v.array(purgedValidator),
    notFound: v.array(v.string()),
  }),
  handler: async (ctx, { nodeDataIds, dryRun = false, purgeVersions = false }) => {
    const purged: Array<typeof purgedValidator.type> = [];
    const notFound: string[] = [];

    for (const nodeDataId of nodeDataIds) {
      const nodeData = await ctx.db.get("nodeDatas", nodeDataId);
      if (!nodeData) {
        notFound.push(nodeDataId);
        continue;
      }

      const template =
        nodeData.templateId !== undefined
          ? await ctx.db.get("nodeTemplates", nodeData.templateId)
          : null;

      const chunks = await ctx.db
        .query("searchableChunks")
        .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
        .collect();
      const memories = await ctx.db
        .query("memories")
        .withIndex("by_subject_and_type", (q) => q.eq("subjectId", nodeDataId))
        .collect();
      const versions = await ctx.db
        .query("nodeDataVersions")
        .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
        .collect();

      // Relu à chaque tour : plusieurs nodeDatas du lot peuvent partager le
      // même canvas, et les patchs précédents doivent être visibles ici
      // (read-your-writes).
      const canvas = await ctx.db.get("canvases", nodeData.canvasId);
      const canvasNode = canvas?.nodes?.find(
        (node) => node.nodeDataId === nodeDataId,
      );

      const plan = planCanvasCleanup(canvas, canvasNode?.id);

      purged.push({
        nodeDataId,
        canvasId: nodeData.canvasId,
        type: nodeData.type,
        title: getNodeDataTitle(nodeData, template),
        ...(canvasNode ? { canvasNodeId: canvasNode.id } : {}),
        chunks: chunks.length,
        memories: memories.length,
        versions: versions.length,
        edgesRemoved: plan.edgesRemoved,
        childrenDetached: plan.childrenDetached,
      });

      if (dryRun) continue;

      if (canvas && plan.changed) {
        await ctx.db.patch("canvases", canvas._id, {
          nodes: plan.nodes,
          edges: plan.edges,
          updatedAt: Date.now(),
        });
      }

      // Chunks, memories, refs R2 et snapshot final — même code que le chemin
      // utilisateur.
      await NodeDataModels.deleteNodeDataWithCascade(ctx, { nodeDataId });

      if (purgeVersions) {
        // APRÈS la cascade : celle-ci pose elle-même un dernier snapshot
        // (`trigger: "delete"`), qu'il faut emporter avec le reste.
        const remaining = await ctx.db
          .query("nodeDataVersions")
          .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
          .collect();
        for (const version of remaining) {
          await ctx.db.delete("nodeDataVersions", version._id);
        }
      }
    }

    const label = dryRun ? "🧪 Aperçu de purge" : "🗑️ Purge";
    console.log(
      `${label} : ${purged.length} node(s), ${notFound.length} introuvable(s)\n${JSON.stringify(purged, null, 2)}`,
    );

    return { dryRun, purged, notFound };
  },
});

/**
 * Ce que le retrait d'un node laisse derrière lui sur le canvas.
 *
 * - les arêtes qui le touchent deviendraient pendantes (React Flow les retire
 *   côté client sur le chemin utilisateur, personne ne le fait ici) ;
 * - les nodes qui le désignent comme `parentId` pointeraient dans le vide. Ils
 *   sont détachés plutôt que supprimés : effacer en silence des nodes que
 *   l'appelant n'a pas nommés serait la mauvaise surprise.
 */
function planCanvasCleanup(
  canvas: Doc<"canvases"> | null,
  canvasNodeId: string | undefined,
): {
  nodes: Doc<"canvases">["nodes"];
  edges: Doc<"canvases">["edges"];
  edgesRemoved: number;
  childrenDetached: number;
  changed: boolean;
} {
  const currentNodes = canvas?.nodes ?? [];
  const currentEdges = canvas?.edges ?? [];

  if (!canvas || !canvasNodeId) {
    return {
      nodes: currentNodes,
      edges: currentEdges,
      edgesRemoved: 0,
      childrenDetached: 0,
      changed: false,
    };
  }

  const edges = currentEdges.filter(
    (edge) => edge.source !== canvasNodeId && edge.target !== canvasNodeId,
  );

  let childrenDetached = 0;
  const nodes = currentNodes
    .filter((node) => node.id !== canvasNodeId)
    .map((node) => {
      if (node.parentId !== canvasNodeId) return node;
      childrenDetached += 1;
      // `extent: "parent"` n'a plus de sens sans parent et ferait échouer le
      // rendu React Flow.
      const { parentId: _parentId, extent: _extent, ...detached } = node;
      return detached;
    });

  return {
    nodes,
    edges,
    edgesRemoved: currentEdges.length - edges.length,
    childrenDetached,
    changed: true,
  };
}
