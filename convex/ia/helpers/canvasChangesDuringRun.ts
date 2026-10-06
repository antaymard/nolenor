import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import * as NodeModels from "../../models/nodeModels";
import { runWrites } from "../../harness/runWrites";

/** Au-delà, on compte sans lister : le modèle a `list_nodes` pour le détail. */
const MAX_LISTED = 20;
const MAX_SCANNED = 200;

/**
 * Les nodes modifiés sur un canvas pendant une fenêtre d'un run, par quelqu'un
 * d'autre que ce run : l'utilisateur pendant que Nolë travaille, ou un
 * collaborateur.
 *
 * Source provisoire : `nodeDatas.updatedAt`, qui ne dit pas QUI a écrit. Les
 * écritures du run sont retirées par recoupement (cf. harness/runWrites.ts).
 * À remplacer par une table de modifications avec leur acteur, quand elle
 * existera : seule cette query changera.
 */
export const canvasChangesDuringRun = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    threadId: v.string(),
    runMessageId: v.string(),
    since: v.number(),
    until: v.number(),
  },
  returns: v.object({
    nodes: v.array(
      v.object({
        id: v.string(),
        type: v.string(),
        title: v.string(),
        frameId: v.union(v.string(), v.null()),
      }),
    ),
    more: v.number(),
  }),
  handler: async (ctx, args) => {
    const changed = await ctx.db
      .query("nodeDatas")
      .withIndex("by_canvasId_and_updatedAt", (q) =>
        q
          .eq("canvasId", args.canvasId)
          .gt("updatedAt", args.since)
          .lte("updatedAt", args.until),
      )
      .take(MAX_SCANNED);
    if (changed.length === 0) return { nodes: [], more: 0 };

    // Ce que le run a écrit lui-même.
    const own = await runWrites(ctx, args);

    const nodes = [];
    for (const nodeData of changed) {
      if (own.nodeDataIds.has(nodeData._id)) continue;
      const node = await NodeModels.getNodeByNodeDataId(ctx, {
        nodeDataId: nodeData._id,
      });
      if (!node || node.status === "trashed" || own.nodeIds.has(node.id)) {
        continue;
      }
      nodes.push({
        id: node.id,
        type: node.type,
        title: getNodeDataTitle(nodeData),
        frameId: node.parentId ?? null,
      });
    }
    return {
      nodes: nodes.slice(0, MAX_LISTED),
      more: Math.max(0, nodes.length - MAX_LISTED),
    };
  },
});
