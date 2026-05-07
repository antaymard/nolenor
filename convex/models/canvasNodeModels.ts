import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import errors from "../config/errorsConfig";
import { nodeDataConfig } from "../config/nodeConfig";
import { internal } from "../_generated/api";
import * as SearchableChunkModels from "./searchableChunkModels";

type CanvasNode = NonNullable<Doc<"canvases">["nodes"]>[number];

type NodeChange = {
  id: string;
  position?: {
    x: number;
    y: number;
  };
  dimensions?: {
    width: number;
    height: number;
  };
};

type CanvasNodePropsUpdate = {
  id: string;
  props?: {
    locked?: boolean;
    hidden?: boolean;
    zIndex?: number;
    color?: string;
    variant?: string;
  };
  data?: Record<string, unknown>;
};

async function getCanvas(
  ctx: QueryCtx | MutationCtx,
  canvasId: Id<"canvases">,
): Promise<Doc<"canvases">> {
  const canvas = await ctx.db.get("canvases", canvasId);
  if (!canvas) throw new ConvexError(errors.CANVAS_NOT_FOUND);
  return canvas;
}

export async function addCanvasNodes(
  ctx: MutationCtx,
  {
    canvasId,
    canvasNodes,
  }: {
    canvasId: Id<"canvases">;
    canvasNodes: Array<CanvasNode>;
  },
): Promise<boolean> {
  const canvas = await getCanvas(ctx, canvasId);

  // Add default node variant if not provided
  const nodesWithDefaults = canvasNodes.map((node) => {
    if (node.variant !== undefined) return node;
    const config = nodeDataConfig.find((c) => c.type === node.type);
    if (!config?.variants) return node;
    const defaultVariantKey = Object.entries(config.variants).find(
      ([, v]) => v.isDefault,
    )?.[0];
    if (!defaultVariantKey) return node;
    return { ...node, variant: defaultVariantKey };
  });

  await ctx.db.patch("canvases", canvasId, {
    nodes: [...(canvas.nodes ?? []), ...nodesWithDefaults],
    updatedAt: Date.now(),
  });

  console.log(`✅ Added ${canvasNodes.length} nodes to canvas ${canvasId}`);

  return true;
}

export async function updatePositionOrDimensions(
  ctx: MutationCtx,
  {
    canvasId,
    nodeChanges,
  }: {
    canvasId: Id<"canvases">;
    nodeChanges: Array<NodeChange>;
  },
): Promise<boolean> {
  const canvas = await getCanvas(ctx, canvasId);
  const nodes = canvas.nodes ?? [];

  const updatedNodes = nodes.map((node) => {
    const change = nodeChanges.find((item) => item.id === node.id);
    if (!change) return node;

    const updatedNode = { ...node };

    if (change.position) {
      updatedNode.position = {
        x: change.position.x,
        y: change.position.y,
      };
    }

    if (change.dimensions) {
      updatedNode.width = change.dimensions.width;
      updatedNode.height = change.dimensions.height;
    }

    return updatedNode;
  });

  await ctx.db.patch("canvases", canvasId, {
    nodes: updatedNodes,
    updatedAt: Date.now(),
  });

  const changedNodeIds = nodeChanges.map((change) => change.id).join(", ");

  console.log(
    `✅ Updated position/dimensions for ${nodeChanges.length} nodes in canvas ${canvasId} (nodeIds: ${changedNodeIds})`,
  );

  return true;
}

export async function updateCanvasNodes(
  ctx: MutationCtx,
  {
    canvasId,
    nodeProps,
  }: {
    canvasId: Id<"canvases">;
    nodeProps: Array<CanvasNodePropsUpdate>;
  },
): Promise<boolean> {
  const canvas = await getCanvas(ctx, canvasId);
  const nodes = canvas.nodes ?? [];

  const updatedNodes = nodes.map((node) => {
    const nodeProp = nodeProps.find((item) => item.id === node.id);
    if (!nodeProp) return node;

    const updatedNode = { ...node };

    if (nodeProp.props) {
      if (nodeProp.props.locked !== undefined) {
        updatedNode.locked = nodeProp.props.locked;
      }

      if (nodeProp.props.hidden !== undefined) {
        updatedNode.hidden = nodeProp.props.hidden;
      }

      if (nodeProp.props.zIndex !== undefined) {
        updatedNode.zIndex = nodeProp.props.zIndex;
      }

      if (nodeProp.props.color !== undefined) {
        updatedNode.color = nodeProp.props.color;
      }

      if (nodeProp.props.variant !== undefined) {
        updatedNode.variant = nodeProp.props.variant;
      }
    }

    if (nodeProp.data !== undefined) {
      updatedNode.data = {
        ...(node.data ?? {}),
        ...nodeProp.data,
      };
    }

    return updatedNode;
  });

  await ctx.db.patch("canvases", canvasId, {
    nodes: updatedNodes,
    updatedAt: Date.now(),
  });

  console.log(
    `✅ Updated display props for ${nodeProps.length} nodes in canvas ${canvasId}`,
  );

  return true;
}

export async function removeCanvasNodes(
  ctx: MutationCtx,
  {
    canvasId,
    nodeCanvasIds,
  }: {
    authUserId: Id<"users">;
    canvasId: Id<"canvases">;
    nodeCanvasIds: Array<string>;
  },
): Promise<boolean> {
  const canvas = await getCanvas(ctx, canvasId);
  const currentNodes = canvas.nodes ?? [];
  const nodeCanvasIdSet = new Set(nodeCanvasIds);

  const removedNodes = currentNodes.filter((node) =>
    nodeCanvasIdSet.has(node.id),
  );
  const remainingNodes = currentNodes.filter(
    (node) => !nodeCanvasIdSet.has(node.id),
  );

  const removedNodeDataIds = removedNodes
    .map((node) => node.nodeDataId)
    .filter((id): id is Id<"nodeDatas"> => id !== undefined);

  await ctx.db.patch("canvases", canvasId, {
    nodes: remainingNodes,
    updatedAt: Date.now(),
  });

  // Schedule cascade deletion (memories + chunks + nodeData) as a deferred job.
  // This decouples canvas node removal from data deletion, enabling future ctrl-Z.
  for (const nodeDataId of removedNodeDataIds) {
    await ctx.scheduler.runAfter(
      0,
      internal.wrappers.nodeDataWrappers.deleteWithCascade,
      { nodeDataId },
    );
  }

  if (removedNodeDataIds.length > 0) {
    console.log(
      `🗑️ Scheduled cascade deletion for ${removedNodeDataIds.length} nodeDatas`,
    );
  }

  console.log(
    `✅ Removed ${nodeCanvasIds.length} nodes from canvas ${canvasId}`,
  );

  return true;
}

export async function moveToCanvas(
  ctx: MutationCtx,
  {
    sourceCanvasId,
    targetCanvasId,
    nodeCanvasIds,
  }: {
    sourceCanvasId: Id<"canvases">;
    targetCanvasId: Id<"canvases">;
    nodeCanvasIds: Array<string>;
  },
): Promise<boolean> {
  if (sourceCanvasId === targetCanvasId) {
    throw new ConvexError(errors.SOURCE_AND_TARGET_CANVAS_MUST_BE_DIFFERENT);
  }

  const sourceCanvas = await getCanvas(ctx, sourceCanvasId);
  const targetCanvas = await getCanvas(ctx, targetCanvasId);

  const sourceNodes = sourceCanvas.nodes ?? [];
  const sourceEdges = sourceCanvas.edges ?? [];
  const targetNodes = targetCanvas.nodes ?? [];
  const nodeCanvasIdSet = new Set(nodeCanvasIds);

  const nodesToMove = sourceNodes.filter((node) =>
    nodeCanvasIdSet.has(node.id),
  );
  const remainingSourceNodes = sourceNodes.filter(
    (node) => !nodeCanvasIdSet.has(node.id),
  );
  const remainingSourceEdges = sourceEdges.filter(
    (edge) =>
      !nodeCanvasIdSet.has(edge.source) && !nodeCanvasIdSet.has(edge.target),
  );

  await ctx.db.patch("canvases", sourceCanvasId, {
    nodes: remainingSourceNodes,
    edges: remainingSourceEdges,
    updatedAt: Date.now(),
  });
  await ctx.db.patch("canvases", targetCanvasId, {
    nodes: [...targetNodes, ...nodesToMove],
    updatedAt: Date.now(),
  });

  // Update canvasId on moved NodeDatas and their memories.
  const movedNodeDataIds = nodesToMove
    .map((node) => node.nodeDataId)
    .filter((id): id is Id<"nodeDatas"> => id !== undefined);

  for (const nodeDataId of movedNodeDataIds) {
    await ctx.db.patch(nodeDataId, { canvasId: targetCanvasId });

    await SearchableChunkModels.updateCanvasId(ctx, {
      nodeDataId,
      canvasId: targetCanvasId,
    });
  }

  console.log(
    `✅ Moved ${nodeCanvasIds.length} nodes from canvas ${sourceCanvasId} to canvas ${targetCanvasId}`,
  );

  return true;
}

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
  const canvas = await getCanvas(ctx, canvasId);
  const node = (canvas.nodes ?? []).find((item) => item.id === nodeId);

  if (!node) {
    throw new ConvexError(errors.NODE_NOT_FOUND);
  }

  if (!node.nodeDataId) {
    throw new ConvexError(errors.NODE_DATA_NOT_FOUND_FOR_NODE);
  }

  const nodeData = await ctx.db.get("nodeDatas", node.nodeDataId);
  if (!nodeData) {
    throw new ConvexError(errors.NODE_DATA_NOT_FOUND);
  }

  return { node, nodeData };
}
