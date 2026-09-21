import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import { type Doc, type Id } from "../../_generated/dataModel";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import { isNodeTypeReadableByAgent } from "../../config/nodeConfig";
import { absolutePositionsById } from "../../lib/nodeGeometry";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { buildNodeDataSchemaXml } from "../helpers/nodeDataSchemaXml";
import { escapeXmlAttribute } from "../../lib/xml";
import { EXPLANATION_FIELD, toolError, type ToolConfig } from "./toolHelpers";

export const listNodesToolConfig: ToolConfig = {
  name: "list_nodes",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.worker,
  ],
  mcp: { access: "read" },
};

// is v1.0
export default function listNodesTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "A tool to list and filter nodes from the current canvas. Returns a compact list of nodes (id, type, title, position) without their full content. Use read_nodes to get the full content of specific nodes after identifying them with this tool. All filters are combined with AND logic — call the tool multiple times to simulate OR. Results are capped at 20 nodes; if truncated, refine your filters to narrow down.",
    inputSchema: z.object({
      explanation: EXPLANATION_FIELD,
      nodeTypes: z
        .array(z.string())
        .optional()
        .describe(
          "Filter by node types (e.g. ['blocknote', 'image', 'table']). If omitted, all types are included.",
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
      frameId: z
        .string()
        .optional()
        .describe(
          "Filter to the nodes contained in this frame (the frame's node ID). Frames are the canvas's explicit grouping: use this instead of guessing membership from positions.",
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

        // Positions MONDE : un node qui vit dans une frame porte une position
        // relative à elle, et tout ce qui suit (filtres `area`/`near`,
        // coordonnées rendues) raisonne en monde.
        const nodePosById = absolutePositionsById(canvasNodes);

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
          // Types invisibles pour l'agent : ils ne sont jamais listés, quels
          // que soient les filtres demandés.
          if (!isNodeTypeReadableByAgent(node.type)) return false;

          if (input.nodeTypes && input.nodeTypes.length > 0) {
            if (!input.nodeTypes.includes(node.type)) return false;
          }

          if (connectedNodeIds !== null) {
            if (!connectedNodeIds.has(node.id)) return false;
          }

          if (input.frameId && node.parentId !== input.frameId) return false;

          const position = nodePosById.get(node.id) ?? node.position;

          if (input.area) {
            const { x1, y1, x2, y2 } = input.area;
            const nx = position.x;
            const ny = position.y;
            if (nx < x1 || nx > x2 || ny < y1 || ny > y2) return false;
          }

          if (input.near && nearCenter) {
            const dx = position.x - nearCenter.x;
            const dy = position.y - nearCenter.y;
            if (Math.sqrt(dx * dx + dy * dy) > 500) return false;
          }

          return true;
        });

        console.log(
          `📋 Found ${filteredNodes.length} node(s) matching filters`,
        );

        // Templates des custom nodes listés : cache par templateId (titres
        // exacts + entrées <nodeDataSchemas> par template).
        const templateCache = new Map<
          string,
          Promise<Doc<"nodeTemplates"> | null>
        >();
        const fetchTemplate = (templateId: Id<"nodeTemplates">) => {
          const key = String(templateId);
          if (!templateCache.has(key)) {
            templateCache.set(
              key,
              ctx.runQuery(internal.wrappers.nodeTemplateWrappers.getTemplate, {
                templateId,
              }),
            );
          }
          return templateCache.get(key)!;
        };

        // Fetch titles for filtered nodes that have nodeData
        const nodeEntries = await Promise.all(
          filteredNodes.map(async (node) => {
            let title = "Untitled";
            if (node.nodeDataId) {
              try {
                const { nodeData } = await ctx.runQuery(
                  internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
                  {
                    canvasId: canvasId as Id<"canvases">,
                    nodeId: node.id,
                  },
                );
                const template = nodeData.templateId
                  ? await fetchTemplate(nodeData.templateId)
                  : null;
                title = getNodeDataTitle(nodeData, template);
              } catch {
                // keep "Untitled"
              }
            }
            const position = nodePosById.get(node.id) ?? node.position;
            return {
              id: node.id,
              type: node.type,
              title,
              x: Math.trunc(position.x),
              y: Math.trunc(position.y),
              // La frame qui contient ce node, quand il y en a une : c'est le
              // seul groupement explicite du canvas, et le lire ici évite un
              // aller-retour pour savoir ce qui va avec quoi.
              frameId: node.parentId ?? null,
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

        const resolvedTemplates = (
          await Promise.all([...templateCache.values()])
        ).filter((t): t is Doc<"nodeTemplates"> => t !== null);

        const xml = [
          `<nodes count="${displayedEntries.length}"${truncated ? ` truncated="true" total="${nodeEntries.length}"` : ""}>`,
          ...displayedEntries.map(({ id, type, title, x, y, frameId }) => {
            const frameAttr = frameId ? ` frameId="${frameId}"` : "";
            return `  <node id="${id}" type="${type}" title="${escapeXmlAttribute(title)}" x="${x}" y="${y}"${frameAttr} />`;
          }),
          "</nodes>",
          "<nodeDataSchemas>",
          // Filtre les vides : un custom node dont le template n'est plus
          // résoluble n'a pas de schéma à publier.
          ...uniqueDisplayedNodeTypes
            .map((nodeType) =>
              buildNodeDataSchemaXml(nodeType, resolvedTemplates),
            )
            .filter((entry) => entry.length > 0),
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
