import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import errors from "../config/errorsConfig";

type CanvasEdge = NonNullable<Doc<"canvases">["edges"]>[number];

type EdgeUpdate = {
  id: string;
  data?: Record<string, unknown>;
};

async function getCanvas(
  ctx: MutationCtx,
  canvasId: Doc<"canvases">["_id"],
): Promise<Doc<"canvases">> {
  const canvas = await ctx.db.get("canvases", canvasId);
  if (!canvas) {
    throw new ConvexError(errors.CANVAS_NOT_FOUND);
  }
  return canvas;
}

const DEFAULT_MARKER_END = {
  type: "arrow",
  width: 30,
  height: 30,
  strokeWidth: 1,
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
  const canvas = await getCanvas(ctx, canvasId);

  const edgesWithDefaults = edges.map((edge) => ({
    ...edge,
    markerEnd: edge.markerEnd ?? DEFAULT_MARKER_END,
  }));

  await ctx.db.patch("canvases", canvasId, {
    edges: [...(canvas.edges ?? []), ...edgesWithDefaults],
    updatedAt: Date.now(),
  });

  console.log(`✅ Added ${edges.length} edges to canvas ${canvasId}`);
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
  const canvas = await getCanvas(ctx, canvasId);
  const edges = canvas.edges ?? [];

  const updatedEdges = edges.map((edge) => {
    const update = edgeUpdates.find((item) => item.id === edge.id);
    if (!update) {
      return edge;
    }

    return {
      ...edge,
      data: update.data ? { ...(edge.data ?? {}), ...update.data } : edge.data,
    };
  });

  await ctx.db.patch("canvases", canvasId, {
    edges: updatedEdges,
    updatedAt: Date.now(),
  });

  console.log(`✅ Updated ${edgeUpdates.length} edges in canvas ${canvasId}`);
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
  const canvas = await getCanvas(ctx, canvasId);

  await ctx.db.patch("canvases", canvasId, {
    edges: (canvas.edges ?? []).filter((edge) => !edgeIds.includes(edge.id)),
    updatedAt: Date.now(),
  });

  console.log(`✅ Removed ${edgeIds.length} edges from canvas ${canvasId}`);
  return true;
}
