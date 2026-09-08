import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requireActiveCanvas } from "../lib/auth";
import {
  assertMutationBatch,
  deleteEdgeMirror,
  nextGraphRevision,
  type LegacyCanvasEdge,
  upsertEdgeMirror,
  validateLegacyGraph,
} from "./canvasGraphModels";

type CanvasEdge = LegacyCanvasEdge;
type EdgeUpdate = { id: string; data?: Record<string, unknown> };

const DEFAULT_MARKER_END = {
  type: "arrow",
  width: 30,
  height: 30,
  strokeWidth: 1,
};

function requireUniqueIds(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new ConvexError(`${label} contains duplicate IDs.`);
  }
}

export async function addCanvasEdges(
  ctx: MutationCtx,
  {
    canvasId,
    edges,
  }: { canvasId: Doc<"canvases">["_id"]; edges: CanvasEdge[] },
): Promise<boolean> {
  assertMutationBatch(edges.length, "Edge addition");
  requireUniqueIds(
    edges.map((edge) => edge.id),
    "Edge addition",
  );
  if (edges.length === 0) return true;

  const canvas = await requireActiveCanvas(ctx, canvasId);
  const currentEdges = canvas.edges ?? [];
  const currentIds = new Set(currentEdges.map((edge) => edge.id));
  const edgesWithDefaults = edges.map((edge) => ({
    ...edge,
    markerEnd: edge.markerEnd ?? DEFAULT_MARKER_END,
  }));
  for (const edge of edgesWithDefaults) {
    if (currentIds.has(edge.id)) {
      throw new ConvexError(`Edge ID already exists in this canvas: ${edge.id}.`);
    }
  }
  const nextEdges = [...currentEdges, ...edgesWithDefaults];
  await validateLegacyGraph(ctx, canvas.nodes ?? [], nextEdges);
  for (const edge of edgesWithDefaults) {
    await upsertEdgeMirror(ctx, canvasId, edge);
  }
  await ctx.db.patch("canvases", canvasId, {
    edges: nextEdges,
    graphRevision: nextGraphRevision(canvas),
    updatedAt: Date.now(),
  });
  return true;
}

export async function updateCanvasEdges(
  ctx: MutationCtx,
  {
    canvasId,
    edgeUpdates,
  }: {
    canvasId: Doc<"canvases">["_id"];
    edgeUpdates: EdgeUpdate[];
  },
): Promise<boolean> {
  assertMutationBatch(edgeUpdates.length, "Edge update");
  requireUniqueIds(
    edgeUpdates.map((update) => update.id),
    "Edge update",
  );
  if (edgeUpdates.length === 0) return true;

  const canvas = await requireActiveCanvas(ctx, canvasId);
  const updates = new Map(edgeUpdates.map((update) => [update.id, update]));
  for (const id of updates.keys()) {
    if (!(canvas.edges ?? []).some((edge) => edge.id === id)) {
      throw new ConvexError(`Edge not found in this canvas: ${id}.`);
    }
  }
  const updatedEdges = (canvas.edges ?? []).map((edge) => {
    const update = updates.get(edge.id);
    if (!update) return edge;
    return {
      ...edge,
      ...(update.data
        ? { data: { ...(edge.data ?? {}), ...update.data } }
        : {}),
    };
  });
  await validateLegacyGraph(ctx, canvas.nodes ?? [], updatedEdges);
  for (const id of updates.keys()) {
    const edge = updatedEdges.find((candidate) => candidate.id === id);
    if (edge) await upsertEdgeMirror(ctx, canvasId, edge);
  }
  await ctx.db.patch("canvases", canvasId, {
    edges: updatedEdges,
    graphRevision: nextGraphRevision(canvas),
    updatedAt: Date.now(),
  });
  return true;
}

export async function removeCanvasEdges(
  ctx: MutationCtx,
  {
    canvasId,
    edgeIds,
  }: { canvasId: Doc<"canvases">["_id"]; edgeIds: string[] },
): Promise<boolean> {
  assertMutationBatch(edgeIds.length, "Edge removal");
  requireUniqueIds(edgeIds, "Edge removal");
  if (edgeIds.length === 0) return true;

  const canvas = await requireActiveCanvas(ctx, canvasId);
  const selected = new Set(edgeIds);
  const removed = (canvas.edges ?? []).filter((edge) => selected.has(edge.id));
  if (removed.length === 0) return true;
  const remaining = (canvas.edges ?? []).filter(
    (edge) => !selected.has(edge.id),
  );
  await validateLegacyGraph(ctx, canvas.nodes ?? [], remaining);
  for (const edge of removed) await deleteEdgeMirror(ctx, canvasId, edge.id);
  await ctx.db.patch("canvases", canvasId, {
    edges: remaining,
    graphRevision: nextGraphRevision(canvas),
    updatedAt: Date.now(),
  });
  return true;
}
