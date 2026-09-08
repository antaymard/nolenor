import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import { readLegacyNodeData } from "../../lib/legacyNodeDataReaders";

export const getCanvasChangesSinceLastMessage = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    lastMessageAt: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, { canvasId, lastMessageAt }) => {
    const canvas = await ctx.db.get("canvases", canvasId);
    if (!canvas) return "";

    const changedNodes = await Promise.all(
      (canvas.nodes ?? []).map(async (node) => {
        const nodeData = await readLegacyNodeData(ctx, canvasId, node);
        if (!nodeData) return null;
        if (nodeData.updatedAt <= lastMessageAt) return null;

        const embed =
          node.type === "embed" &&
          typeof nodeData.values.embed === "object" &&
          nodeData.values.embed !== null
            ? (nodeData.values.embed as {
                url?: unknown;
                embedUrl?: unknown;
                type?: unknown;
              })
            : null;

        return {
          id: node.id,
          type: node.type,
          title: getNodeDataTitle(nodeData),
          embedUrl:
            typeof embed?.url === "string" && embed.url.length > 0
              ? embed.url
              : null,
          embedIframeUrl:
            typeof embed?.embedUrl === "string" && embed.embedUrl.length > 0
              ? embed.embedUrl
              : null,
          embedType:
            typeof embed?.type === "string" && embed.type.length > 0
              ? embed.type
              : null,
        };
      }),
    );

    const xmlNodes = changedNodes.flatMap((node) =>
      node
        ? [
            node.type === "embed"
              ? `<node id="${node.id}" type="embed" title="${node.title}"${node.embedUrl ? ` url="${node.embedUrl}"` : ""}${node.embedIframeUrl ? ` embedUrl="${node.embedIframeUrl}"` : ""}${node.embedType ? ` embedType="${node.embedType}"` : ""} />`
              : `<node id="${node.id}" type="${node.type}" title="${node.title}"/>`,
          ]
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
