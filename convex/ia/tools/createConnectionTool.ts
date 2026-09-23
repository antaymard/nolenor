import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import {
  EDGE_LABEL_FIELD,
  EXPLANATION_FIELD,
  getClosestHandlesForDirectedEdge,
  getEdgeLabel,
  type NodeRect,
  type ToolConfig,
  toolError,
} from "./toolHelpers";

// Tool compaction config
export const createConnectionToolConfig: ToolConfig = {
  name: "create_connection",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.worker,
  ],
  mcp: { access: "write" },
};

export default function createConnectionTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Create a directed connection between two existing nodes, optionally with a label naming the relation. " +
      'If the connection already exists, passing `label` updates its label instead ("" removes it).',
    inputSchema: z.object({
      explanation: EXPLANATION_FIELD,
      sourceNodeId: z
        .string()
        .describe("Source node ID in the current canvas."),
      targetNodeId: z
        .string()
        .describe("Target node ID in the current canvas."),
      label: EDGE_LABEL_FIELD.optional(),
    }),
    execute: async (ctx, input) => {
      try {
        const { sourceNodeId, targetNodeId } = input;
        // `undefined` : pas de label demandé. `""` : effacer le label.
        const label = input.label?.trim();

        if (sourceNodeId === targetNodeId) {
          return toolError("sourceNodeId and targetNodeId must be different.");
        }

        const { nodes, edges } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
          {
            canvasId,
          },
        );

        const sourceNode = nodes.find((node) => node.id === sourceNodeId);
        if (!sourceNode) {
          return toolError(`Source node ${sourceNodeId} was not found.`);
        }

        const targetNode = nodes.find((node) => node.id === targetNodeId);
        if (!targetNode) {
          return toolError(`Target node ${targetNodeId} was not found.`);
        }

        const existingEdge = edges.find(
          (edge) =>
            edge.source === sourceNodeId && edge.target === targetNodeId,
        );
        if (existingEdge) {
          if (label === undefined) {
            return toolError(
              `A connection from ${sourceNodeId} to ${targetNodeId} already exists. Pass \`label\` to change its label.`,
            );
          }

          // Upsert du label : c'est le seul moyen pour l'agent de modifier
          // une edge existante sans en connaître l'id. `null` pour effacer,
          // comme l'éditeur inline du canvas.
          await ctx.runMutation(internal.wrappers.edgeWrappers.patch, {
            updates: [
              {
                edgeId: existingEdge.id,
                data: { label: label === "" ? null : label },
              },
            ],
          });

          return {
            success: true,
            updated: true,
            edgeId: existingEdge.id,
            sourceNodeId,
            targetNodeId,
            previousLabel: getEdgeLabel(existingEdge),
            label: label === "" ? null : label,
          };
        }

        const sourceRect: NodeRect = {
          id: sourceNode.id,
          position: sourceNode.position,
          width: sourceNode.width,
          height: sourceNode.height,
        };

        const targetRect: NodeRect = {
          id: targetNode.id,
          position: targetNode.position,
          width: targetNode.width,
          height: targetNode.height,
        };

        const { sourceHandle, targetHandle } = getClosestHandlesForDirectedEdge(
          {
            from: sourceRect,
            to: targetRect,
          },
        );

        // Id serveur via `edgeWrappers.create` : le llmId est généré et
        // vérifié côté base, jamais côté tool.
        const [edgeId] = await ctx.runMutation(
          internal.wrappers.edgeWrappers.create,
          {
            edges: [
              {
                canvasId,
                source: sourceNodeId,
                target: targetNodeId,
                sourceHandle,
                targetHandle,
                ...(label && { data: { label } }),
              },
            ],
          },
        );

        return {
          success: true,
          updated: false,
          edgeId,
          sourceNodeId,
          targetNodeId,
          label: label || null,
        };
      } catch (error) {
        return toolError(
          `Error while creating connection: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
}
