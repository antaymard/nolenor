import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import type { Doc } from "../../_generated/dataModel";
import { toolAgentNames, type ThreadCtx } from "../../ia/agentConfig";
import { buildNodeDataSchemaXml } from "../../ia/helpers/nodeDataSchemaXml";
import {
  EXPLANATION_FIELD,
  toolError,
  type ToolConfig,
} from "../../ia/tools/toolHelpers";
import { escapeXmlAttribute } from "../../lib/xml";
import { canvasScope } from "../scope";
import {
  listNodes,
  type ListNodesFilters,
  type NodeSummary,
} from "./listNodes";

/**
 * Adaptateur agent de `listNodes` : le tool `list_nodes` de Nolë, du worker
 * et du MCP. Ne fait que traduire — l'entrée du modèle en filtres, le
 * résultat en XML plafonné.
 */

/** Ce que le modèle voit au plus ; au-delà, il affine ses filtres. */
const DISPLAY_LIMIT = 20;

export const listNodesToolConfig: ToolConfig = {
  name: "list_nodes",
  // Lecture seule : relancer un appel interrompu ne peut rien dupliquer.
  replay: "safe",
  authorized_agents: [toolAgentNames.nole, toolAgentNames.worker],
  mcp: { access: "read" },
};

const inputSchema = z.object({
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
    .describe(
      "Filter nodes connected via an edge to the specified node. Each listed node then carries the label of that edge (edgeLabel) when it has one.",
    ),
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
});

/**
 * Le modèle remplit souvent chaque filtre optionnel avec une valeur vide
 * quand il n'en veut pas (`near: { nodeId: "" }`, `frameId: ""`, une zone
 * `{0,0,0,0}`) : vide veut dire « pas de filtre ».
 */
export function filtersFromModelInput(
  input: z.infer<typeof inputSchema>,
): ListNodesFilters {
  const types = (input.nodeTypes ?? [])
    .map((type) => type.trim())
    .filter((type) => type.length > 0);
  const linkedNodeId = input.targetNode?.nodeId.trim();
  const nearNodeId = input.near?.nodeId.trim();
  const frameId = input.frameId?.trim();
  const area =
    input.area &&
    (input.area.x1 !== input.area.x2 || input.area.y1 !== input.area.y2)
      ? input.area
      : undefined;
  return {
    ...(types.length > 0 && { types }),
    ...(input.targetNode &&
      linkedNodeId && {
        linkedTo: { nodeId: linkedNodeId, direction: input.targetNode.direction },
      }),
    ...(area && { area }),
    ...(nearNodeId && { near: { nodeId: nearNodeId } }),
    ...(frameId && { frameId }),
  };
}

/** Le XML que lit le modèle. */
export function renderListNodes(
  nodes: NodeSummary[],
  templates: Doc<"nodeTemplates">[],
): string {
  if (nodes.length === 0) {
    return "No nodes found matching the given filters.\n\nUse the read_nodes tool to read the full content of specific nodes.";
  }

  const truncated = nodes.length > DISPLAY_LIMIT;
  const displayed = truncated ? nodes.slice(0, DISPLAY_LIMIT) : nodes;
  const displayedTypes = [...new Set(displayed.map((node) => node.type))];

  return [
    `<nodes count="${displayed.length}"${truncated ? ` truncated="true" total="${nodes.length}"` : ""}>`,
    ...displayed.map(({ id, type, title, x, y, frameId, color, edgeLabels }) => {
      const frameAttr = frameId ? ` frameId="${frameId}"` : "";
      const colorAttr = color ? ` color="${escapeXmlAttribute(color)}"` : "";
      const edgeLabelAttr =
        edgeLabels.length > 0
          ? ` edgeLabel="${escapeXmlAttribute(edgeLabels.join(" ; "))}"`
          : "";
      return `  <node id="${id}" type="${type}" title="${escapeXmlAttribute(title)}" x="${Math.trunc(x)}" y="${Math.trunc(y)}"${frameAttr}${colorAttr}${edgeLabelAttr} />`;
    }),
    "</nodes>",
    "<nodeDataSchemas>",
    // Un custom node dont le template n'est plus résoluble n'a pas de schéma
    // à publier.
    ...displayedTypes
      .map((nodeType) => buildNodeDataSchemaXml(nodeType, templates))
      .filter((entry) => entry.length > 0),
    "</nodeDataSchemas>",
    "",
    truncated
      ? `Results truncated to ${DISPLAY_LIMIT} of ${nodes.length} matching nodes. Add or refine filters to narrow down results.`
      : "Use the read_nodes tool to read the full content of the relevant nodes identified above.",
  ].join("\n");
}

export default function listNodesTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const scope = canvasScope({
    userId: threadCtx.authUserId,
    canvasId: threadCtx.canvasId,
  });

  return createTool({
    description: `A tool to list and filter nodes from the current canvas. Returns a compact list of nodes (id, type, title, position) without their full content. Use read_nodes to get the full content of specific nodes after identifying them with this tool. Every filter is optional: omit the ones you don't need rather than passing empty values. All filters are combined with AND logic — call the tool multiple times to simulate OR. Nodes come most recently modified first (content edits). Results are capped at ${DISPLAY_LIMIT} nodes; if truncated, refine your filters to narrow down.`,
    inputSchema,
    execute: async (ctx, input): Promise<string> => {
      try {
        const result = await listNodes(
          ctx,
          scope,
          filtersFromModelInput(input),
        );
        if (!result.ok) return toolError(result.error);
        return renderListNodes(result.nodes, result.templates);
      } catch (error) {
        console.error("List nodes error:", error);
        return toolError(
          `Failed to list nodes: ${error instanceof Error ? error.message : "Unknown error"}.`,
        );
      }
    },
  });
}
