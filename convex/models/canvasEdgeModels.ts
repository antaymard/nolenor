import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import * as EdgeModels from "./edgeModels";

/**
 * Shims legacy `api.canvasEdges.*` / `canvasEdgeWrappers.*` : signatures
 * inchangées pour les appelants (front `useCanvasEdges` /
 * `useUpdateCanvasEdge`, tools IA `createConnectionTool` /
 * `createNodeTool`), mais tout vit dans la table `edges` — plus aucune
 * écriture `canvases.edges`. Miroir de ce que `canvasNodeModels` est devenu
 * pour les nodes pendant la transition.
 */

type CanvasEdge = NonNullable<Doc<"canvases">["edges"]>[number];

type EdgeUpdate = {
  id: string;
  data?: Record<string, unknown>;
};

export async function addCanvasEdges(
  ctx: MutationCtx,
  {
    canvasId,
    edges,
  }: {
    canvasId: Doc<"canvases">["_id"];
    edges: Array<CanvasEdge>;
  },
): Promise<boolean> {
  if (edges.length === 0) return true;

  // Les ids clients (onConnect, duplicate, tools IA) sont préservés : le
  // state ReactFlow local et la table doivent désigner la même edge.
  await EdgeModels.createEdges(ctx, {
    edges: edges.map((edge) => ({ ...edge, canvasId })),
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
    edgeUpdates: Array<EdgeUpdate>;
  },
): Promise<boolean> {
  if (edgeUpdates.length === 0) return true;

  // Parité legacy : les updates visant des edges hors de ce canvas sont
  // ignorées en silence (l'ancien code mappait seulement l'array du canvas).
  const updates: Array<{ edgeId: string; data?: Record<string, unknown> }> =
    [];
  for (const update of edgeUpdates) {
    const edge = await EdgeModels.getEdgeByLlmId(ctx, { edgeId: update.id });
    if (!edge || edge.canvasId !== canvasId) continue;
    updates.push({ edgeId: update.id, data: update.data });
  }

  if (updates.length === 0) return true;

  await EdgeModels.patchEdges(ctx, { updates });
  return true;
}

export async function removeCanvasEdges(
  ctx: MutationCtx,
  {
    canvasId,
    edgeIds,
  }: {
    canvasId: Doc<"canvases">["_id"];
    edgeIds: Array<string>;
  },
): Promise<boolean> {
  if (edgeIds.length === 0) return true;

  // Parité legacy : suppression scopée au canvas, ids inconnus ignorés.
  const scopedIds: string[] = [];
  for (const edgeId of edgeIds) {
    const edge = await EdgeModels.getEdgeByLlmId(ctx, { edgeId });
    if (edge && edge.canvasId === canvasId) scopedIds.push(edgeId);
  }

  if (scopedIds.length === 0) return true;

  await EdgeModels.trashEdges(ctx, { edgeIds: scopedIds });
  return true;
}
