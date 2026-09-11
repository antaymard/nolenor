import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import errors from "../config/errorsConfig";
import { nodeDataConfig } from "../config/nodeConfig";
import { internal } from "../_generated/api";
import * as CanvasModels from "./canvasModels";
import * as NodeModels from "./nodeModels";

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

function withDefaultVariant(node: CanvasNode): CanvasNode {
  if (node.variant !== undefined) return node;
  const config = nodeDataConfig.find((c) => c.type === node.type);
  if (!config?.variants) return node;
  const defaultVariantKey = Object.entries(config.variants).find(
    ([, v]) => v.isDefault,
  )?.[0];
  if (!defaultVariantKey) return node;
  return { ...node, variant: defaultVariantKey };
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
  if (canvasNodes.length === 0) return true;
  await getCanvas(ctx, canvasId);

  const nodesWithDefaults = canvasNodes.map(withDefaultVariant);

  for (const node of nodesWithDefaults) {
    await NodeModels.upsertLayoutNode(ctx, { canvasId, node });
  }

  await CanvasModels.touchCanvas(ctx, canvasId);

  const nodeDataIds = nodesWithDefaults.flatMap((node) =>
    node.nodeDataId ? [node.nodeDataId] : [],
  );

  if (nodeDataIds.length > 0) {
    await ctx.scheduler.runAfter(
      0,
      internal.searchable.chunkBuilder.rebuildChunksBatch,
      { nodeDataIds },
    );
  }

  return true;
}

export async function updatePositionOrDimensions(
  ctx: MutationCtx,
  {
    nodeChanges,
  }: {
    canvasId: Id<"canvases">;
    nodeChanges: Array<NodeChange>;
  },
): Promise<boolean> {
  const updates: Array<{
    nodeId: string;
    props: {
      position?: { x: number; y: number };
      width?: number;
      height?: number;
    };
  }> = [];

  for (const change of nodeChanges) {
    const existing = await NodeModels.getNodeByLlmId(ctx, {
      nodeId: change.id,
    });
    if (!existing || existing.status === "trashed") continue;
    updates.push({
      nodeId: change.id,
      props: {
        ...(change.position && { position: change.position }),
        ...(change.dimensions && {
          width: change.dimensions.width,
          height: change.dimensions.height,
        }),
      },
    });
  }

  if (updates.length === 0) return true;
  await NodeModels.patchNodes(ctx, { updates });
  return true;
}

export async function updateCanvasNodes(
  ctx: MutationCtx,
  {
    nodeProps,
  }: {
    canvasId: Id<"canvases">;
    nodeProps: Array<CanvasNodePropsUpdate>;
  },
): Promise<boolean> {
  const updates: Array<{
    nodeId: string;
    props: NonNullable<CanvasNodePropsUpdate["props"]> & {
      data?: Record<string, unknown>;
    };
  }> = [];

  for (const nodeProp of nodeProps) {
    const existing = await NodeModels.getNodeByLlmId(ctx, {
      nodeId: nodeProp.id,
    });
    if (!existing || existing.status === "trashed") continue;
    updates.push({
      nodeId: nodeProp.id,
      props: {
        ...(nodeProp.props ?? {}),
        ...(nodeProp.data !== undefined && { data: nodeProp.data }),
      },
    });
  }

  if (updates.length === 0) return true;
  await NodeModels.patchNodes(ctx, { updates });
  return true;
}

export async function removeCanvasNodes(
  ctx: MutationCtx,
  {
    authUserId,
    nodeCanvasIds,
  }: {
    authUserId: Id<"users">;
    canvasId: Id<"canvases">;
    nodeCanvasIds: Array<string>;
  },
): Promise<boolean> {
  const existing = [];
  for (const nodeId of nodeCanvasIds) {
    const node = await NodeModels.getNodeByLlmId(ctx, { nodeId });
    if (node && node.status !== "trashed") existing.push(node);
  }
  if (existing.length === 0) return true;

  await NodeModels.trashNodes(ctx, {
    nodeIds: existing.map((node) => node.id),
    actor: { type: "user", userId: authUserId },
  });

  return true;
}

export async function moveToCanvas(
  ctx: MutationCtx,
  args: {
    sourceCanvasId: Id<"canvases">;
    targetCanvasId: Id<"canvases">;
    nodeCanvasIds: Array<string>;
  },
): Promise<boolean> {
  // `moveNodes` gère tout : déplacement nodeData/chunks + suppression des
  // edges de la table `edges` qui touchent un node déplacé.
  await NodeModels.moveNodes(ctx, {
    nodeIds: args.nodeCanvasIds,
    targetCanvasId: args.targetCanvasId,
  });

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
