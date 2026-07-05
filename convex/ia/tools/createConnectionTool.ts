import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { generateLlmId } from "../../lib/llmId";
import {
  getClosestHandlesForDirectedEdge,
  type NodeRect,
  ToolConfig,
  toolError,
} from "./toolHelpers";

// Tool compaction config
export const createConnectionToolConfig: ToolConfig = {
  name: "create_connection",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
  mcp: { access: "editor" },
};

export default function createConnectionTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description: "Create a directed connection between two existing nodes.",
    inputSchema: z.object({
      sourceNodeId: z
        .string()
        .describe("Source node ID in the current canvas."),
      targetNodeId: z
        .string()
        .describe("Target node ID in the current canvas."),
    }),
    execute: async (ctx, input) => {
      try {
        const { sourceNodeId, targetNodeId } = input;

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
          return toolError(
            `A connection from ${sourceNodeId} to ${targetNodeId} already exists.`,
          );
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

        const edgeId = generateLlmId();

        await ctx.runMutation(internal.wrappers.canvasEdgeWrappers.add, {
          canvasId,
          edges: [
            {
              id: edgeId,
              source: sourceNodeId,
              target: targetNodeId,
              sourceHandle,
              targetHandle,
            },
          ],
        });

        return {
          success: true,
          edgeId,
          sourceNodeId,
          targetNodeId,
        };
      } catch (error) {
        return toolError(
          `Error while creating connection: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
}
