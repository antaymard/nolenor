import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { GRAPH_LIMITS, graphValueBytes } from "../config/canvasGraphConfig";
import { resolveLegacyNodeDataId } from "../lib/legacyNodeDataReaders";

export type LegacyCanvasNode = NonNullable<Doc<"canvases">["nodes"]>[number];
export type LegacyCanvasEdge = NonNullable<Doc<"canvases">["edges"]>[number];
type NodeRow = Omit<Doc<"nodes">, "_id" | "_creationTime">;
type EdgeRow = Omit<Doc<"edges">, "_id" | "_creationTime">;
type ReadCtx = Pick<QueryCtx, "db">;

function withoutReservedNodeData(
  data: LegacyCanvasNode["data"],
): LegacyCanvasNode["data"] {
  if (!data) return undefined;
  const { nodeDataId: _nodeDataId, ...rest } = data;
  void _nodeDataId;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

export function normalizeLegacyNodeReference(
  ctx: ReadCtx,
  node: LegacyCanvasNode,
): LegacyCanvasNode {
  const nodeDataId = resolveLegacyNodeDataId(ctx, node);
  const data = withoutReservedNodeData(node.data);
  const {
    nodeDataId: _nodeDataId,
    data: _data,
    ...placement
  } = node;
  void _nodeDataId;
  void _data;
  return {
    ...placement,
    ...(nodeDataId ? { nodeDataId } : {}),
    ...(data ? { data } : {}),
  };
}

export async function normalizeCanvasNode(
  ctx: ReadCtx,
  canvasId: Id<"canvases">,
  node: LegacyCanvasNode,
): Promise<NodeRow> {
  const normalized = normalizeLegacyNodeReference(ctx, node);
  const nodeDataId = normalized.nodeDataId;
  const data = normalized.data;
  return {
    canvasId,
    nodeId: node.id,
    ...(nodeDataId ? { nodeDataId } : {}),
    type: node.type,
    position: node.position,
    width: node.width,
    height: node.height,
    ...(node.locked !== undefined ? { locked: node.locked } : {}),
    ...(node.hidden !== undefined ? { hidden: node.hidden } : {}),
    ...(node.zIndex !== undefined ? { zIndex: node.zIndex } : {}),
    ...(node.color !== undefined ? { color: node.color } : {}),
    ...(node.variant !== undefined ? { variant: node.variant } : {}),
    ...(node.parentId !== undefined ? { parentId: node.parentId } : {}),
    ...(node.extent !== undefined ? { extent: node.extent } : {}),
    ...(node.extendParent !== undefined
      ? { extendParent: node.extendParent }
      : {}),
    ...(data ? { data } : {}),
  };
}

export function normalizeCanvasEdge(
  canvasId: Id<"canvases">,
  edge: LegacyCanvasEdge,
): EdgeRow {
  return {
    canvasId,
    edgeId: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle !== undefined
      ? { sourceHandle: edge.sourceHandle }
      : {}),
    ...(edge.targetHandle !== undefined
      ? { targetHandle: edge.targetHandle }
      : {}),
    ...(edge.markerEnd !== undefined ? { markerEnd: edge.markerEnd } : {}),
    ...(edge.data !== undefined ? { data: edge.data } : {}),
  };
}

export function graphValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof ArrayBuffer && right instanceof ArrayBuffer) {
    if (left.byteLength !== right.byteLength) return false;
    const a = new Uint8Array(left);
    const b = new Uint8Array(right);
    return a.every((value, index) => value === b[index]);
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => graphValuesEqual(value, right[index]))
    );
  }
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        graphValuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function assertGraphBudget(
  nodes: LegacyCanvasNode[],
  edges: LegacyCanvasEdge[],
): void {
  if (
    nodes.length > GRAPH_LIMITS.graphNodes ||
    edges.length > GRAPH_LIMITS.graphEdges ||
    graphValueBytes({ nodes, edges }) > GRAPH_LIMITS.graphBytes
  ) {
    throw new ConvexError("Canvas graph exceeds the phase 1 full-read budget.");
  }
}

export async function validateLegacyGraph(
  ctx: ReadCtx,
  nodes: LegacyCanvasNode[],
  edges: LegacyCanvasEdge[],
): Promise<void> {
  assertGraphBudget(nodes, edges);
  const nodesById = new Map<string, LegacyCanvasNode>();
  const nodeDataIds = new Set<Id<"nodeDatas">>();
  for (const node of nodes) {
    if (!node.id || nodesById.has(node.id)) {
      throw new ConvexError(`Duplicate or empty node ID: ${node.id}.`);
    }
    nodesById.set(node.id, node);
    const nodeDataId = resolveLegacyNodeDataId(ctx, node);
    if (nodeDataId && nodeDataIds.has(nodeDataId)) {
      throw new ConvexError(`NodeData has multiple placements: ${nodeDataId}.`);
    }
    if (nodeDataId) nodeDataIds.add(nodeDataId);
  }

  for (const node of nodes) {
    if (node.parentId !== undefined && !nodesById.has(node.parentId)) {
      throw new ConvexError(`Missing parent ${node.parentId} for node ${node.id}.`);
    }
    const visited = new Set<string>();
    let current: LegacyCanvasNode | undefined = node;
    while (current?.parentId !== undefined) {
      if (visited.has(current.id)) {
        throw new ConvexError(`Parent cycle involving node ${node.id}.`);
      }
      visited.add(current.id);
      current = nodesById.get(current.parentId);
    }
  }

  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (!edge.id || edgeIds.has(edge.id)) {
      throw new ConvexError(`Duplicate or empty edge ID: ${edge.id}.`);
    }
    edgeIds.add(edge.id);
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
      throw new ConvexError(`Edge ${edge.id} has a missing endpoint.`);
    }
  }
}

export async function upsertNodeMirror(
  ctx: MutationCtx,
  canvasId: Id<"canvases">,
  node: LegacyCanvasNode,
): Promise<void> {
  const row = await normalizeCanvasNode(ctx, canvasId, node);
  if (row.nodeDataId) {
    const nodeData = await ctx.db.get("nodeDatas", row.nodeDataId);
    if (
      !nodeData ||
      nodeData.canvasId !== canvasId ||
      nodeData.type !== row.type
    ) {
      throw new ConvexError(`Invalid nodeData reference for node ${node.id}.`);
    }
    if (
      node.data?.templateId !== undefined &&
      node.data.templateId !== nodeData.templateId
    ) {
      throw new ConvexError(`Conflicting template reference for node ${node.id}.`);
    }
    if (nodeData.type === "custom" && !nodeData.templateId) {
      throw new ConvexError(`Custom node ${node.id} has no template.`);
    }
    if (
      nodeData.templateId &&
      !(await ctx.db.get("nodeTemplates", nodeData.templateId))
    ) {
      throw new ConvexError(`Template not found for node ${node.id}.`);
    }
    const placements = await ctx.db
      .query("nodes")
      .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", row.nodeDataId))
      .take(2);
    if (
      placements.length > 1 ||
      placements.some(
        (placement) =>
          placement.canvasId !== canvasId || placement.nodeId !== node.id,
      )
    ) {
      throw new ConvexError(`NodeData already has another placement: ${row.nodeDataId}.`);
    }
  }

  const existing = await ctx.db
    .query("nodes")
    .withIndex("by_canvasId_and_nodeId", (q) =>
      q.eq("canvasId", canvasId).eq("nodeId", node.id),
    )
    .take(2);
  if (existing.length > 1) {
    throw new ConvexError(`Duplicate mirrored node ID: ${node.id}.`);
  }
  if (!existing[0]) await ctx.db.insert("nodes", row);
  else if (!graphValuesEqual(row, stripSystemFields(existing[0]))) {
    await ctx.db.replace("nodes", existing[0]._id, row);
  }
}

export async function upsertEdgeMirror(
  ctx: MutationCtx,
  canvasId: Id<"canvases">,
  edge: LegacyCanvasEdge,
): Promise<void> {
  const row = normalizeCanvasEdge(canvasId, edge);
  const existing = await ctx.db
    .query("edges")
    .withIndex("by_canvasId_and_edgeId", (q) =>
      q.eq("canvasId", canvasId).eq("edgeId", edge.id),
    )
    .take(2);
  if (existing.length > 1) {
    throw new ConvexError(`Duplicate mirrored edge ID: ${edge.id}.`);
  }
  if (!existing[0]) await ctx.db.insert("edges", row);
  else if (!graphValuesEqual(row, stripSystemFields(existing[0]))) {
    await ctx.db.replace("edges", existing[0]._id, row);
  }
}

export async function deleteNodeMirror(
  ctx: MutationCtx,
  canvasId: Id<"canvases">,
  nodeId: string,
): Promise<void> {
  const rows = await ctx.db
    .query("nodes")
    .withIndex("by_canvasId_and_nodeId", (q) =>
      q.eq("canvasId", canvasId).eq("nodeId", nodeId),
    )
    .take(2);
  if (rows.length > 1) throw new ConvexError(`Duplicate mirrored node ID: ${nodeId}.`);
  if (rows[0]) await ctx.db.delete("nodes", rows[0]._id);
}

export async function deleteEdgeMirror(
  ctx: MutationCtx,
  canvasId: Id<"canvases">,
  edgeId: string,
): Promise<void> {
  const rows = await ctx.db
    .query("edges")
    .withIndex("by_canvasId_and_edgeId", (q) =>
      q.eq("canvasId", canvasId).eq("edgeId", edgeId),
    )
    .take(2);
  if (rows.length > 1) throw new ConvexError(`Duplicate mirrored edge ID: ${edgeId}.`);
  if (rows[0]) await ctx.db.delete("edges", rows[0]._id);
}

export function assertMutationBatch(size: number, label: string): void {
  if (size > GRAPH_LIMITS.mutationItems) {
    throw new ConvexError(
      `${label} exceeds the atomic batch limit of ${GRAPH_LIMITS.mutationItems}.`,
    );
  }
}

export function nextGraphRevision(canvas: Doc<"canvases">): number {
  const revision = canvas.graphRevision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new ConvexError("Canvas graph revision is invalid.");
  }
  return revision + 1;
}

function stripSystemFields<T extends { _id: unknown; _creationTime: number }>(
  row: T,
): Omit<T, "_id" | "_creationTime"> {
  const { _id, _creationTime, ...value } = row;
  void _id;
  void _creationTime;
  return value;
}
