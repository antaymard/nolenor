import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import * as NodeModels from "../../models/nodeModels";
import * as ThreadMetadataModels from "../../models/threadMetadataModels";
import { agentTaskKinds } from "../../schemas/agentTasksSchema";

/** Au-delà, on compte sans lister : le modèle a `list_nodes` pour le détail. */
const MAX_LISTED = 20;
const MAX_SCANNED = 200;

/**
 * Les nodes modifiés sur un canvas pendant une fenêtre d'un run, par quelqu'un
 * d'autre que ce run : l'utilisateur pendant que Nolë travaille, ou un
 * collaborateur.
 *
 * Source provisoire : `nodeDatas.updatedAt`, qui ne dit pas QUI a écrit. Les
 * écritures du run sont donc retirées par recoupement — nodes visés par ses
 * tool calls, nodes que le thread a touchés depuis le début du run. À
 * remplacer par une table de modifications avec leur acteur, quand elle
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
    const ownNodeIds = new Set<string>();
    const tools = await ctx.db
      .query("agentTasks")
      .withIndex("by_runMessageId_and_kind", (q) =>
        q.eq("runMessageId", args.runMessageId).eq("kind", agentTaskKinds.tool),
      )
      .take(500);
    for (const tool of tools) {
      if (tool.replay === "safe") continue; // une lecture n'écrit rien
      for (const id of targetNodeIds(tool.input)) ownNodeIds.add(id);
    }
    const [firstGeneration] = await ctx.db
      .query("agentTasks")
      .withIndex("by_runMessageId_and_kind", (q) =>
        q
          .eq("runMessageId", args.runMessageId)
          .eq("kind", agentTaskKinds.generation),
      )
      .take(1);
    const runStartedAt = firstGeneration?._creationTime ?? args.since;
    const thread = await ThreadMetadataModels.findByThreadId(ctx, {
      threadId: args.threadId,
    });
    const ownNodeDataIds = new Set<string>(
      (thread?.touchedNodes ?? [])
        .filter((touch) => touch.at >= runStartedAt)
        .map((touch) => touch.nodeDataId),
    );

    const nodes = [];
    for (const nodeData of changed) {
      if (ownNodeDataIds.has(nodeData._id)) continue;
      const node = await NodeModels.getNodeByNodeDataId(ctx, {
        nodeDataId: nodeData._id,
      });
      if (!node || node.status === "trashed" || ownNodeIds.has(node.id)) {
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

function targetNodeIds(input: unknown): string[] {
  if (typeof input !== "object" || input === null) return [];
  const { nodeIds, nodeId } = input as { nodeIds?: unknown; nodeId?: unknown };
  if (Array.isArray(nodeIds)) {
    return nodeIds.filter((id): id is string => typeof id === "string");
  }
  return typeof nodeId === "string" ? [nodeId] : [];
}
