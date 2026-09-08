import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type CanvasNode = NonNullable<Doc<"canvases">["nodes"]>[number];

export function resolveLegacyNodeDataId(
  ctx: Pick<QueryCtx, "db">,
  node: CanvasNode,
): Id<"nodeDatas"> | undefined {
  const dataId: unknown = node.data?.nodeDataId;
  if (
    node.nodeDataId !== undefined &&
    dataId !== undefined &&
    node.nodeDataId !== dataId
  ) {
    throw new ConvexError(`Conflicting nodeData references for node ${node.id}.`);
  }

  // Only an absent column permits the historical data.nodeDataId fallback.
  const candidate: unknown =
    node.nodeDataId !== undefined ? node.nodeDataId : dataId;
  if (candidate === undefined) return undefined;

  const nodeDataId =
    typeof candidate === "string"
      ? ctx.db.normalizeId("nodeDatas", candidate)
      : null;
  if (!nodeDataId) {
    throw new ConvexError(`Invalid nodeData reference for node ${node.id}.`);
  }
  return nodeDataId;
}

// Integrity only: callers must authorize the canvas before reading its placements.
export async function readLegacyNodeData(
  ctx: Pick<QueryCtx, "db">,
  canvasId: Id<"canvases">,
  node: CanvasNode,
): Promise<Doc<"nodeDatas"> | null> {
  const nodeDataId = resolveLegacyNodeDataId(ctx, node);
  if (nodeDataId === undefined) return null;

  const nodeData = await ctx.db.get("nodeDatas", nodeDataId);
  if (
    !nodeData ||
    nodeData.canvasId !== canvasId ||
    nodeData.type !== node.type
  ) {
    throw new ConvexError(`Invalid nodeData reference for node ${node.id}.`);
  }
  return nodeData;
}
