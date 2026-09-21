import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import * as NodeModels from "../../models/nodeModels";

export const getCanvasChangesSinceLastMessage = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    lastMessageAt: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, { canvasId, lastMessageAt }) => {
    const canvas = await ctx.db.get("canvases", canvasId);
    if (!canvas) return "";

    const tableNodes = await NodeModels.listFromCanvas(ctx, { canvasId });

    const changedNodes = await Promise.all(
      tableNodes.map(async (node) => {
        if (!node.nodeDataId) return null;

        const nodeData = await ctx.db.get("nodeDatas", node.nodeDataId);
        if (!nodeData) return null;
        if (nodeData.updatedAt <= lastMessageAt) return null;

        return {
          id: node.id,
          type: node.type,
          title: getNodeDataTitle(nodeData),
        };
      }),
    );

    const xmlNodes = changedNodes.flatMap((node) =>
      node
        ? [`<node id="${node.id}" type="${node.type}" title="${node.title}"/>`]
        : [],
    );

    if (xmlNodes.length === 0) return "";

    return [
      "<modified_since_last_message>",
      "<description>The following nodes have been modified by the user since the last message. Those modifications can or cannot be relevant to the current context.</description>",
      ...xmlNodes,
      "</modified_since_last_message>",
    ].join("\n");
  },
});
