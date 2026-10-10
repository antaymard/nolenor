import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { getNodeCapabilities } from "../../config/nodeConfig";
import { EXPLANATION_FIELD, type ToolConfig, toolError } from "./toolHelpers";

/** Un appel supprime peu : au-delà, c'est un ménage à proposer à l'utilisateur. */
const MAX_DELETED_NODES = 30;
const MAX_DELETED_CONNECTIONS = 30;

export const deleteElementsToolConfig: ToolConfig = {
  name: "delete_elements",
  deferred: true,
  authorized_agents: [toolAgentNames.nole, toolAgentNames.worker],
  mcp: { access: "write" },
};

/**
 * Supprimer des nodes et des connexions — par la corbeille, jamais pour de bon.
 *
 * Même chemin que la touche Suppr du canvas (`trashNodes` / `trashEdges`) : le
 * contenu reste en base 30 jours, et la modale corbeille le rend avec ses
 * connexions. C'est ce qui rend ce tool acceptable pour un agent, dont les
 * écritures n'entrent dans aucune pile d'annulation.
 *
 * Les connexions se désignent par leurs deux extrémités et pas par un id :
 * l'agent ne voit jamais d'id d'edge (`read_nodes` liste des nodes voisins), et
 * deux nodes ne sont reliés qu'une fois, dans un seul sens — la paire suffit.
 *
 * Tout-ou-rien, comme `group_nodes` : un id inconnu fait échouer l'appel sans
 * rien écrire. Une suppression partielle que l'agent croirait complète serait
 * pire qu'un refus.
 */
export default function deleteElementsTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Delete nodes and/or connections from the canvas. They go to the canvas Trash, where the user can restore them for 30 days (a restored node comes back with its connections). Deleting a node also deletes its connections; deleting a frame also deletes every node inside it. Only delete what the user asked you to remove, or nodes you created yourself in this conversation and are replacing — never clean up the user's content on your own initiative. Every id must exist on this canvas, otherwise nothing is deleted. Tell the user what you deleted and that it is in the Trash.",
    inputSchema: z.object({
      explanation: EXPLANATION_FIELD,
      nodeIds: z
        .array(z.string())
        .max(MAX_DELETED_NODES)
        .optional()
        .describe("The ids of the nodes to delete."),
      connections: z
        .array(
          z.object({
            sourceNodeId: z.string(),
            targetNodeId: z.string(),
          }),
        )
        .max(MAX_DELETED_CONNECTIONS)
        .optional()
        .describe(
          "Connections to delete, each named by the two nodes it links. Two nodes are linked at most once, so the pair identifies the connection; the direction does not matter. Not needed for the connections of a node you delete: they go with it.",
        ),
    }),
    execute: async (ctx, input) => {
      try {
        const nodeIds = [...new Set(input.nodeIds ?? [])];
        const pairs = input.connections ?? [];
        if (nodeIds.length === 0 && pairs.length === 0) {
          return toolError(
            "Nothing to delete: pass nodeIds and/or connections.",
          );
        }

        const { nodes, edges } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
          { canvasId },
        );
        const byId = new Map(nodes.map((node) => [node.id, node]));

        // Un type que l'agent ne voit pas est traité comme inconnu, sans
        // nommer son type — même règle que `group_nodes`.
        const unknown = nodeIds.filter((nodeId) => {
          const node = byId.get(nodeId);
          return !node || !getNodeCapabilities(node.type).agent.readable;
        });
        if (unknown.length > 0) {
          return toolError(
            `No node with this id on this canvas: ${unknown.join(", ")}. Nothing was deleted.`,
          );
        }

        const edgeIds: string[] = [];
        const missingPairs: string[] = [];
        for (const { sourceNodeId, targetNodeId } of pairs) {
          const edge = edges.find(
            (candidate) =>
              (candidate.source === sourceNodeId &&
                candidate.target === targetNodeId) ||
              (candidate.source === targetNodeId &&
                candidate.target === sourceNodeId),
          );
          if (!edge) {
            missingPairs.push(`${sourceNodeId} ↔ ${targetNodeId}`);
            continue;
          }
          edgeIds.push(edge.id);
        }
        if (missingPairs.length > 0) {
          return toolError(
            `No connection between: ${missingPairs.join(", ")}. Nothing was deleted.`,
          );
        }

        // Ce qui part avec les nodes nommés, rapporté pour que l'agent sache
        // ce qu'il a fait : le contenu des frames, et les connexions.
        const named = new Set(nodeIds);
        const frameContents = nodes
          .filter(
            (node) => node.parentId !== undefined && named.has(node.parentId),
          )
          .map((node) => node.id)
          .filter((nodeId) => !named.has(nodeId));
        const goneNodes = new Set([...nodeIds, ...frameContents]);
        const explicitEdges = new Set(edgeIds);
        const cascadedConnections = edges.filter(
          (edge) =>
            !explicitEdges.has(edge.id) &&
            (goneNodes.has(edge.source) || goneNodes.has(edge.target)),
        ).length;

        const result = await ctx.runMutation(
          internal.wrappers.nodeWrappers.trashFromAgent,
          {
            canvasId,
            nodeIds,
            edgeIds: [...explicitEdges],
            actor: {
              type: "agent",
              userId: threadCtx.authUserId,
              threadId: ctx.threadId,
            },
          },
        );

        console.log(
          `🗑️ Trashed ${result.nodeIds.length} node(s), ${explicitEdges.size + cascadedConnections} connection(s)`,
        );

        return {
          success: true,
          deletedNodeIds: nodeIds,
          ...(frameContents.length > 0 && {
            deletedWithTheirFrame: frameContents,
          }),
          deletedConnections: explicitEdges.size + cascadedConnections,
          trash:
            "Everything deleted is in the canvas Trash (top-right) for 30 days; the user can restore it from there.",
        };
      } catch (error) {
        return toolError(
          `Error while deleting: ${error instanceof Error ? error.message : String(error)}. Nothing was deleted.`,
        );
      }
    },
  });
}
