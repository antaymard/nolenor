import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import errors from "../config/errorsConfig";
import { nodeDataConfig } from "../config/nodeConfig";
import { requireActiveCanvas } from "../lib/auth";
import { readLegacyNodeData } from "../lib/legacyNodeDataReaders";
import {
  assertMutationBatch,
  deleteEdgeMirror,
  deleteNodeMirror,
  nextGraphRevision,
  normalizeLegacyNodeReference,
  type LegacyCanvasNode,
  upsertEdgeMirror,
  upsertNodeMirror,
  validateLegacyGraph,
} from "./canvasGraphModels";
import * as SearchableChunkModels from "./searchableChunkModels";

type CanvasNode = LegacyCanvasNode;

type NodeChange = {
  id: string;
  position?: { x: number; y: number };
  dimensions?: { width: number; height: number };
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
  return await requireActiveCanvas(ctx, canvasId);
}

function requireUniqueIds(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new ConvexError(`${label} contains duplicate IDs.`);
  }
}

function withDefaultVariant(node: CanvasNode): CanvasNode {
  if (node.variant !== undefined) return node;
  const config = nodeDataConfig.find((candidate) => candidate.type === node.type);
  const defaultVariant = config?.variants
    ? Object.entries(config.variants).find(([, variant]) => variant.isDefault)?.[0]
    : undefined;
  return defaultVariant ? { ...node, variant: defaultVariant } : node;
}

export async function addCanvasNodes(
  ctx: MutationCtx,
  {
    canvasId,
    canvasNodes,
  }: { canvasId: Id<"canvases">; canvasNodes: CanvasNode[] },
): Promise<boolean> {
  assertMutationBatch(canvasNodes.length, "Node addition");
  requireUniqueIds(
    canvasNodes.map((node) => node.id),
    "Node addition",
  );
  if (canvasNodes.length === 0) return true;

  const canvas = await getCanvas(ctx, canvasId);
  const currentNodes = canvas.nodes ?? [];
  const currentIds = new Set(currentNodes.map((node) => node.id));
  const nodesWithDefaults = canvasNodes.map((node) =>
    normalizeLegacyNodeReference(ctx, withDefaultVariant(node)),
  );
  for (const node of nodesWithDefaults) {
    if (currentIds.has(node.id)) {
      throw new ConvexError(`Node ID already exists in this canvas: ${node.id}.`);
    }
  }

  const nextNodes = [...currentNodes, ...nodesWithDefaults];
  await validateLegacyGraph(ctx, nextNodes, canvas.edges ?? []);
  for (const node of nodesWithDefaults) {
    await upsertNodeMirror(ctx, canvasId, node);
  }
  await ctx.db.patch("canvases", canvasId, {
    nodes: nextNodes,
    nodeCount: nextNodes.length,
    graphRevision: nextGraphRevision(canvas),
    updatedAt: Date.now(),
  });

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
    canvasId,
    nodeChanges,
  }: { canvasId: Id<"canvases">; nodeChanges: NodeChange[] },
): Promise<boolean> {
  assertMutationBatch(nodeChanges.length, "Node geometry update");
  requireUniqueIds(
    nodeChanges.map((change) => change.id),
    "Node geometry update",
  );
  if (nodeChanges.length === 0) return true;

  const canvas = await getCanvas(ctx, canvasId);
  const nodes = canvas.nodes ?? [];
  const changes = new Map(nodeChanges.map((change) => [change.id, change]));
  for (const id of changes.keys()) {
    if (!nodes.some((node) => node.id === id)) {
      throw new ConvexError(`${errors.NODE_NOT_FOUND} NodeId: ${id}`);
    }
  }
  const updatedNodes = nodes.map((node) => {
    const change = changes.get(node.id);
    if (!change) return node;
    return {
      ...node,
      ...(change.position ? { position: change.position } : {}),
      ...(change.dimensions
        ? {
            width: change.dimensions.width,
            height: change.dimensions.height,
          }
        : {}),
    };
  });
  await validateLegacyGraph(ctx, updatedNodes, canvas.edges ?? []);
  for (const id of changes.keys()) {
    const node = updatedNodes.find((candidate) => candidate.id === id);
    if (node) await upsertNodeMirror(ctx, canvasId, node);
  }
  await ctx.db.patch("canvases", canvasId, {
    nodes: updatedNodes,
    graphRevision: nextGraphRevision(canvas),
    updatedAt: Date.now(),
  });
  return true;
}

export async function updateCanvasNodes(
  ctx: MutationCtx,
  {
    canvasId,
    nodeProps,
  }: { canvasId: Id<"canvases">; nodeProps: CanvasNodePropsUpdate[] },
): Promise<boolean> {
  assertMutationBatch(nodeProps.length, "Node property update");
  requireUniqueIds(
    nodeProps.map((update) => update.id),
    "Node property update",
  );
  for (const update of nodeProps) {
    if (
      update.data &&
      ("nodeDataId" in update.data || "templateId" in update.data)
    ) {
      throw new ConvexError("Node data references cannot be patched as display data.");
    }
  }
  if (nodeProps.length === 0) return true;

  const canvas = await getCanvas(ctx, canvasId);
  const nodes = canvas.nodes ?? [];
  const updates = new Map(nodeProps.map((update) => [update.id, update]));
  for (const id of updates.keys()) {
    if (!nodes.some((node) => node.id === id)) {
      throw new ConvexError(`${errors.NODE_NOT_FOUND} NodeId: ${id}`);
    }
  }
  const updatedNodes = nodes.map((node) => {
    const update = updates.get(node.id);
    if (!update) return node;
    return {
      ...node,
      ...(update.props ?? {}),
      ...(update.data
        ? { data: { ...(node.data ?? {}), ...update.data } }
        : {}),
    };
  });
  await validateLegacyGraph(ctx, updatedNodes, canvas.edges ?? []);
  for (const id of updates.keys()) {
    const node = updatedNodes.find((candidate) => candidate.id === id);
    if (node) await upsertNodeMirror(ctx, canvasId, node);
  }
  await ctx.db.patch("canvases", canvasId, {
    nodes: updatedNodes,
    graphRevision: nextGraphRevision(canvas),
    updatedAt: Date.now(),
  });
  return true;
}

export async function removeCanvasNodes(
  ctx: MutationCtx,
  {
    authUserId,
    canvasId,
    nodeCanvasIds,
  }: {
    authUserId: Id<"users">;
    canvasId: Id<"canvases">;
    nodeCanvasIds: string[];
  },
): Promise<boolean> {
  assertMutationBatch(nodeCanvasIds.length, "Node removal");
  requireUniqueIds(nodeCanvasIds, "Node removal");
  if (nodeCanvasIds.length === 0) return true;

  const canvas = await getCanvas(ctx, canvasId);
  const currentNodes = canvas.nodes ?? [];
  const selected = new Set(nodeCanvasIds);
  const removedNodes = currentNodes.filter((node) => selected.has(node.id));
  if (removedNodes.length === 0) return true;
  for (const node of currentNodes) {
    if (node.parentId && selected.has(node.parentId) && !selected.has(node.id)) {
      throw new ConvexError(
        `Cannot remove parent ${node.parentId} without child ${node.id}.`,
      );
    }
  }

  const removedNodeDataIds: Id<"nodeDatas">[] = [];
  for (const node of removedNodes) {
    const nodeData = await readLegacyNodeData(ctx, canvasId, node);
    if (nodeData) removedNodeDataIds.push(nodeData._id);
  }
  const remainingNodes = currentNodes.filter((node) => !selected.has(node.id));
  const removedEdges = (canvas.edges ?? []).filter(
    (edge) => selected.has(edge.source) || selected.has(edge.target),
  );
  const remainingEdges = (canvas.edges ?? []).filter(
    (edge) => !selected.has(edge.source) && !selected.has(edge.target),
  );
  await validateLegacyGraph(ctx, remainingNodes, remainingEdges);
  for (const node of removedNodes) await deleteNodeMirror(ctx, canvasId, node.id);
  for (const edge of removedEdges) await deleteEdgeMirror(ctx, canvasId, edge.id);
  await ctx.db.patch("canvases", canvasId, {
    nodes: remainingNodes,
    edges: remainingEdges,
    nodeCount: remainingNodes.length,
    graphRevision: nextGraphRevision(canvas),
    updatedAt: Date.now(),
  });
  for (const nodeDataId of new Set(removedNodeDataIds)) {
    await ctx.scheduler.runAfter(
      0,
      internal.wrappers.nodeDataWrappers.deleteWithCascade,
      {
        nodeDataId,
        canvasId,
        actor: { type: "user", userId: authUserId },
      },
    );
  }
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
    nodeCanvasIds: string[];
  },
): Promise<boolean> {
  if (sourceCanvasId === targetCanvasId) {
    throw new ConvexError(errors.SOURCE_AND_TARGET_CANVAS_MUST_BE_DIFFERENT);
  }
  assertMutationBatch(nodeCanvasIds.length, "Canvas move");
  requireUniqueIds(nodeCanvasIds, "Canvas move");
  if (nodeCanvasIds.length === 0) return true;

  const sourceCanvas = await getCanvas(ctx, sourceCanvasId);
  const targetCanvas = await getCanvas(ctx, targetCanvasId);
  const sourceNodes = sourceCanvas.nodes ?? [];
  const sourceEdges = sourceCanvas.edges ?? [];
  const targetNodes = targetCanvas.nodes ?? [];
  const targetEdges = targetCanvas.edges ?? [];
  const selected = new Set(nodeCanvasIds);
  const nodesToMove = sourceNodes
    .filter((node) => selected.has(node.id))
    .map((node) => normalizeLegacyNodeReference(ctx, node));
  if (nodesToMove.length !== selected.size) {
    throw new ConvexError("One or more selected nodes do not exist in the source canvas.");
  }
  const targetNodeIds = new Set(targetNodes.map((node) => node.id));
  for (const node of nodesToMove) {
    if (targetNodeIds.has(node.id)) {
      throw new ConvexError(`Target canvas already contains node ${node.id}.`);
    }
    if (node.parentId && !selected.has(node.parentId)) {
      throw new ConvexError(`Cannot move child ${node.id} without its parent.`);
    }
    await readLegacyNodeData(ctx, sourceCanvasId, node);
  }
  for (const node of sourceNodes) {
    if (node.parentId && selected.has(node.parentId) && !selected.has(node.id)) {
      throw new ConvexError(`Cannot move parent ${node.parentId} without child ${node.id}.`);
    }
  }

  const remainingSourceNodes = sourceNodes.filter((node) => !selected.has(node.id));
  const internalEdges = sourceEdges.filter(
    (edge) => selected.has(edge.source) && selected.has(edge.target),
  );
  const removedSourceEdges = sourceEdges.filter(
    (edge) => selected.has(edge.source) || selected.has(edge.target),
  );
  const remainingSourceEdges = sourceEdges.filter(
    (edge) => !selected.has(edge.source) && !selected.has(edge.target),
  );
  const targetEdgeIds = new Set(targetEdges.map((edge) => edge.id));
  for (const edge of internalEdges) {
    if (targetEdgeIds.has(edge.id)) {
      throw new ConvexError(`Target canvas already contains edge ${edge.id}.`);
    }
  }
  const nextTargetNodes = [...targetNodes, ...nodesToMove];
  const nextTargetEdges = [...targetEdges, ...internalEdges];
  await validateLegacyGraph(ctx, remainingSourceNodes, remainingSourceEdges);
  await validateLegacyGraph(ctx, nextTargetNodes, nextTargetEdges);

  for (const node of nodesToMove) {
    await deleteNodeMirror(ctx, sourceCanvasId, node.id);
  }
  for (const edge of removedSourceEdges) {
    await deleteEdgeMirror(ctx, sourceCanvasId, edge.id);
  }

  let movedChunks = 0;
  let movedChunkBytes = 0;
  for (const node of nodesToMove) {
    if (node.nodeDataId) {
      await ctx.db.patch("nodeDatas", node.nodeDataId, { canvasId: targetCanvasId });
      const usage = await SearchableChunkModels.updateCanvasId(ctx, {
        nodeDataId: node.nodeDataId,
        canvasId: targetCanvasId,
      });
      movedChunks += usage.documents;
      movedChunkBytes += usage.bytes;
      if (
        movedChunks > SearchableChunkModels.MAX_CHUNKS_PER_MOVE ||
        movedChunkBytes > SearchableChunkModels.MAX_CHUNK_MOVE_BYTES
      ) {
        throw new ConvexError("Searchable chunks exceed the atomic move budget.");
      }
    }
    await upsertNodeMirror(ctx, targetCanvasId, node);
  }
  for (const edge of internalEdges) {
    await upsertEdgeMirror(ctx, targetCanvasId, edge);
  }

  const now = Date.now();
  await ctx.db.patch("canvases", sourceCanvasId, {
    nodes: remainingSourceNodes,
    edges: remainingSourceEdges,
    nodeCount: remainingSourceNodes.length,
    graphRevision: nextGraphRevision(sourceCanvas),
    updatedAt: now,
  });
  await ctx.db.patch("canvases", targetCanvasId, {
    nodes: nextTargetNodes,
    edges: nextTargetEdges,
    nodeCount: nextTargetNodes.length,
    graphRevision: nextGraphRevision(targetCanvas),
    updatedAt: now,
  });
  return true;
}

export async function getNodeWithNodeData(
  ctx: QueryCtx,
  {
    canvasId,
    nodeId,
  }: { canvasId: Id<"canvases">; nodeId: string },
): Promise<{ node: CanvasNode; nodeData: Doc<"nodeDatas"> }> {
  const canvas = await getCanvas(ctx, canvasId);
  const matches = (canvas.nodes ?? []).filter((node) => node.id === nodeId);
  if (matches.length !== 1) {
    throw new ConvexError(
      `${errors.NODE_NOT_FOUND} NodeId: ${nodeId} ; CanvasId: ${canvasId}`,
    );
  }
  const nodeData = await readLegacyNodeData(ctx, canvasId, matches[0]);
  if (!nodeData) {
    throw new ConvexError(
      `${errors.NODE_DATA_NOT_FOUND_FOR_NODE} NodeId: ${nodeId} ; CanvasId: ${canvasId}`,
    );
  }
  return { node: matches[0], nodeData };
}
