import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import errors from "../config/errorsConfig";
import type { CanvasNode } from "../schemas/nodesSchema";
import * as NodeModels from "./nodeModels";

/**
 * Node + nodeData d'un canvas, par llmId — le lecteur canonique des tools
 * agent (12+ call-sites) et du resolver de mentions. Le node est projeté en
 * DTO `CanvasNode` (cf. `toCanvasNode`) : llmId visible, champs serveur
 * (`canvasId`, `status`) omis.
 */
export async function getNodeWithNodeData(
  ctx: QueryCtx,
  {
    canvasId,
    nodeId,
  }: {
    canvasId: Id<"canvases">;
    nodeId: string;
  },
): Promise<{
  node: CanvasNode;
  nodeData: Doc<"nodeDatas">;
}> {
  const node = await NodeModels.getNodeByLlmId(ctx, { nodeId });
  if (!node || node.status === "trashed" || node.canvasId !== canvasId) {
    throw new ConvexError(
      errors.NODE_NOT_FOUND + ` NodeId: ${nodeId} ; CanvasId: ${canvasId}`,
    );
  }

  const nodeData = await ctx.db.get("nodeDatas", node.nodeDataId);
  if (!nodeData) {
    throw new ConvexError(
      errors.NODE_DATA_NOT_FOUND + ` NodeId: ${nodeId} ; CanvasId: ${canvasId}`,
    );
  }

  return { node: NodeModels.toCanvasNode(node), nodeData };
}
