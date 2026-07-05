import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { nodeDataConfig } from "../../config/nodeConfig";
import { formatZodSchemaAsMinimap } from "../../lib/jsonSchemaMinimap";
import { toolError, ToolConfig } from "./toolHelpers";

export const listNodesToolConfig: ToolConfig = {
  name: "list_nodes",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
  mcp: { access: "viewer" },
};

function getExpectedNodeDataSchemaString(nodeType: string): string | null {
  if (nodeType === "document" || nodeType === "table") {
    return null;
  }

  const config = nodeDataConfig.find((item) => item.type === nodeType);
  if (!config) {
    return null;
  }

  const schema = config.toolInputSchema ?? config.dataValuesSchema;
  return formatZodSchemaAsMinimap(schema);
}

// is v1.0
export default function listNodesTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "A tool to list and filter nodes from the current canvas. Returns a compact list of nodes (id, type, title, position) without their full content. Use read_nodes to get the full content of specific nodes after identifying them with this tool. All filters are combined with AND logic — call the tool multiple times to simulate OR. Results are capped at 20 nodes; if truncated, refine your filters to narrow down.",
    inputSchema: z.object({
      explanation: z
        .string()
        .describe("3-5 words explaining the research intent."),
      nodeTypes: z
        .array(z.string())
        .optional()
        .describe(
          "Filter by node types (e.g. ['document', 'image', 'table']). If omitted, all types are included.",
        ),
      targetNode: z
        .object({
          nodeId: z.string().describe("The node ID to find connections for"),
          direction: z
            .enum(["input", "output", "both"])
            .describe(
              "input: nodes that connect TO this node (sources), output: nodes this node connects TO (targets), both: all connected nodes",
            ),
        })
        .optional()
        .describe("Filter nodes connected via an edge to the specified node"),
      area: z
        .object({
          x1: z.number(),
          y1: z.number(),
          x2: z.number(),
          y2: z.number(),
        })
        .optional()
        .describe(
          "Filter nodes whose position falls within the bounding box (x1,y1 = top-left corner, x2,y2 = bottom-right corner)",
        ),
      near: z
        .object({
          nodeId: z.string().describe("The reference node ID"),
        })
        .optional()
        .describe(
          "Filter nodes within 500 canvas units of the specified node's position",
        ),
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(`📋 Listing nodes from canvas ${canvasId}`);

      try {
        const { nodes: canvasNodes, edges: canvasEdges } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
          {
            canvasId: canvasId as Id<"canvases">,
          },
        );

        const nodePosById = new Map(
          canvasNodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }]),
        );

        // Resolve connected node IDs if targetNode filter is set
        let connectedNodeIds: Set<string> | null = null;
        if (input.targetNode) {
          const { nodeId, direction } = input.targetNode;
          connectedNodeIds = new Set<string>();
          for (const edge of canvasEdges) {
            if (direction === "output" || direction === "both") {
              if (edge.source === nodeId) connectedNodeIds.add(edge.target);
            }
            if (direction === "input" || direction === "both") {
              if (edge.target === nodeId) connectedNodeIds.add(edge.source);
            }
          }
        }

        // Resolve near center position if set
        let nearCenter: { x: number; y: number } | null = null;
        if (input.near) {
          const pos = nodePosById.get(input.near.nodeId);
          if (!pos) {
            return toolError(
              `Reference node "${input.near.nodeId}" not found on canvas`,
            );
          }
          nearCenter = pos;
        }

        // Apply filters
        const filteredNodes = canvasNodes.filter((node) => {
          if (input.nodeTypes && input.nodeTypes.length > 0) {
            if (!input.nodeTypes.includes(node.type)) return false;
          }

          if (connectedNodeIds !== null) {
            if (!connectedNodeIds.has(node.id)) return false;
          }

          if (input.area) {
            const { x1, y1, x2, y2 } = input.area;
            const nx = node.position.x;
            const ny = node.position.y;
            if (nx < x1 || nx > x2 || ny < y1 || ny > y2) return false;
          }

          if (input.near && nearCenter) {
            const dx = node.position.x - nearCenter.x;
            const dy = node.position.y - nearCenter.y;
            if (Math.sqrt(dx * dx + dy * dy) > 500) return false;
          }

          return true;
        });

        console.log(
          `📋 Found ${filteredNodes.length} node(s) matching filters`,
        );

        // Fetch titles for filtered nodes that have nodeData
        const nodeEntries = await Promise.all(
          filteredNodes.map(async (node) => {
            let title = "Untitled";
            let embedUrl: string | null = null;
            let embedIframeUrl: string | null = null;
            let embedType: string | null = null;
            if (node.nodeDataId) {
              try {
                const { nodeData } = await ctx.runQuery(
                  internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
                  {
                    canvasId: canvasId as Id<"canvases">,
                    nodeId: node.id,
                  },
                );
                title = getNodeDataTitle(nodeData);

                if (
                  node.type === "embed" &&
                  typeof nodeData.values.embed === "object" &&
                  nodeData.values.embed !== null
                ) {
                  const embed = nodeData.values.embed as {
                    url?: unknown;
                    embedUrl?: unknown;
                    type?: unknown;
                  };

                  embedUrl =
                    typeof embed.url === "string" && embed.url.length > 0
                      ? embed.url
                      : null;
                  embedIframeUrl =
                    typeof embed.embedUrl === "string" &&
                    embed.embedUrl.length > 0
                      ? embed.embedUrl
                      : null;
                  embedType =
                    typeof embed.type === "string" && embed.type.length > 0
                      ? embed.type
                      : null;
                }
              } catch {
                // keep "Untitled"
              }
            }
            return {
              id: node.id,
              type: node.type,
              title,
              x: Math.trunc(node.position.x),
              y: Math.trunc(node.position.y),
              embedUrl,
              embedIframeUrl,
              embedType,
            };
          }),
        );

        if (nodeEntries.length === 0) {
          return "No nodes found matching the given filters.\n\nUse the read_nodes tool to read the full content of specific nodes.";
        }

        const limit = 20;
        const truncated = nodeEntries.length > limit;
        const displayedEntries = truncated
          ? nodeEntries.slice(0, limit)
          : nodeEntries;

        const uniqueDisplayedNodeTypes = [
          ...new Set(displayedEntries.map((node) => node.type)),
        ];

        const xml = [
          `<nodes count="${displayedEntries.length}"${truncated ? ` truncated="true" total="${nodeEntries.length}"` : ""}>`,
          ...displayedEntries.map(
            ({ id, type, title, x, y, embedUrl, embedIframeUrl, embedType }) =>
              type === "embed"
                ? `  <node id="${id}" type="embed" title="${title}" x="${x}" y="${y}"${embedUrl ? ` url="${embedUrl}"` : ""}${embedIframeUrl ? ` embedUrl="${embedIframeUrl}"` : ""}${embedType ? ` embedType="${embedType}"` : ""} />`
                : `  <node id="${id}" type="${type}" title="${title}" x="${x}" y="${y}" />`,
          ),
          "</nodes>",
          "<nodeDataSchemas>",
          ...uniqueDisplayedNodeTypes.map((nodeType) => {
            if (nodeType === "document") {
              return '<schema type="document" tools="insert_document_content,string_replace_document_content" />';
            }

            if (nodeType === "table") {
              return '<schema type="table" tools="table_update_schema,table_insert_rows,table_update_rows,table_delete_rows" />';
            }

            const toolsAttr =
              nodeType === "app"
                ? 'tools="set_node_data,patch_app_node_code"'
                : 'tool="set_node_data"';

            const schema = getExpectedNodeDataSchemaString(nodeType);
            if (!schema) {
              return `<schema type="${nodeType}" ${toolsAttr} />`;
            }

            return `<schema type="${nodeType}" ${toolsAttr}>\n${schema}\n</schema>`;
          }),
          "</nodeDataSchemas>",
          "",
          truncated
            ? `Results truncated to ${limit} of ${nodeEntries.length} matching nodes. Add or refine filters to narrow down results.`
            : "Use the read_nodes tool to read the full content of the relevant nodes identified above.",
        ].join("\n");

        console.log("✅ Node listing complete");
        return xml;
      } catch (error) {
        console.error("List nodes error:", error);
        return toolError(
          `Failed to list nodes: ${error instanceof Error ? error.message : "Unknown error"}.`,
        );
      }
    },
  });
}
