import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import errors from "../config/errorsConfig";
import {
  TRASH_PURGE_BATCH_SIZE,
  TRASH_RETENTION_MS,
} from "../config/trashConfig";
import { generateLlmId } from "../lib/llmId";
import * as CanvasModels from "./canvasModels";
import type { CanvasEdge } from "../schemas/edgesSchema";
import type { EdgePatchUpdate } from "../schemas/edgesSchema";

type EdgeDoc = Doc<"edges">;

/**
 * DTO « canvas » edge (cf. `schemas/edgesSchema`) : tout sauf `canvasId`
 * (porté par le canvas côté lecteur) et `status` (détail de storage).
 */
export function toCanvasEdge(doc: EdgeDoc): CanvasEdge {
  return {
    id: doc.id,
    source: doc.source,
    target: doc.target,
    ...(doc.sourceHandle !== undefined && { sourceHandle: doc.sourceHandle }),
    ...(doc.targetHandle !== undefined && { targetHandle: doc.targetHandle }),
    ...(doc.markerEnd !== undefined && { markerEnd: doc.markerEnd }),
    ...(doc.data !== undefined && { data: doc.data }),
  };
}

/** Champs de l'edge fournis par l'appelant : tout sauf clés système, `id` (llmId généré ici) et `status`. */
export type EdgeCreateInput = Omit<
  EdgeDoc,
  "_id" | "_creationTime" | "id" | "status" | "trashedAt"
>;

const MAX_LLMID_ATTEMPTS = 5;

// markerEnd posé à la création si absent.
const DEFAULT_MARKER_END = {
  type: "arrow",
  width: 30,
  height: 30,
  strokeWidth: 1,
};

async function getCanvasOrThrow(
  ctx: MutationCtx,
  canvasId: Id<"canvases">,
): Promise<Doc<"canvases">> {
  const canvas = await ctx.db.get("canvases", canvasId);
  if (!canvas) throw new ConvexError(errors.CANVAS_NOT_FOUND);
  return canvas;
}

function requireSameCanvasId(
  canvasIds: Array<Id<"canvases">>,
): Id<"canvases"> {
  const first = canvasIds[0];
  if (first === undefined) {
    throw new ConvexError(errors.EDGE_NOT_FOUND);
  }
  for (const canvasId of canvasIds) {
    if (canvasId !== first) {
      throw new ConvexError(errors.EDGES_MUST_SHARE_CANVAS);
    }
  }
  return first;
}

async function generateUniqueLlmId(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < MAX_LLMID_ATTEMPTS; attempt++) {
    const candidate = generateLlmId();
    const existing = await ctx.db
      .query("edges")
      .withIndex("by_llmid", (q) => q.eq("id", candidate))
      .unique();
    if (!existing) return candidate;
  }
  throw new ConvexError("Could not generate a unique edge id, please retry.");
}

export async function getEdgeByLlmId(
  ctx: QueryCtx | MutationCtx,
  { edgeId }: { edgeId: string },
): Promise<EdgeDoc | null> {
  return await ctx.db
    .query("edges")
    .withIndex("by_llmid", (q) => q.eq("id", edgeId))
    .unique();
}

export async function getEdgeOrThrow(
  ctx: QueryCtx | MutationCtx,
  { edgeId }: { edgeId: string },
): Promise<EdgeDoc> {
  const edge = await getEdgeByLlmId(ctx, { edgeId });
  if (!edge) throw new ConvexError(errors.EDGE_NOT_FOUND);
  return edge;
}

/**
 * Valide qu'un endpoint d'edge (source ou target) désigne un node vivant de
 * la table `nodes`, sur le même canvas. Query directe sur la table (pas
 * d'import de `nodeModels` : `nodeModels` importe déjà `edgeModels` pour la
 * cascade trash, l'import inverse créerait un cycle).
 */
async function isLiveEndpointNode(
  ctx: MutationCtx,
  { canvasId, nodeId }: { canvasId: Id<"canvases">; nodeId: string },
): Promise<boolean> {
  const node = await ctx.db
    .query("nodes")
    .withIndex("by_llmid", (q) => q.eq("id", nodeId))
    .unique();
  return !!node && node.canvasId === canvasId && node.status !== "trashed";
}

async function requireLiveEndpointNode(
  ctx: MutationCtx,
  { canvasId, nodeId, error }: { canvasId: Id<"canvases">; nodeId: string; error: string },
): Promise<void> {
  if (!(await isLiveEndpointNode(ctx, { canvasId, nodeId }))) {
    throw new ConvexError(error);
  }
}

/**
 * Crée des edges dans la table `edges`. Valide que source/target sont des
 * nodes vivants du même canvas — jamais de dangling edge. Chaque item
 * accepte un `id` optionnel : fourni (création local-first, ids générés
 * client), il est préservé tel quel — idempotent sur le même canvas (retry
 * réseau), conflit refusé cross-canvas ; absent (API publique), un llmId
 * unique est généré côté serveur (`by_llmid`).
 * Retourne les llmIds.
 */
export async function createEdges(
  ctx: MutationCtx,
  {
    edges,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    edges: Array<EdgeCreateInput & { id?: string }>;
    touchCanvas?: boolean;
  },
): Promise<string[]> {
  if (edges.length === 0) return [];

  const canvasId = requireSameCanvasId(edges.map((edge) => edge.canvasId));
  await getCanvasOrThrow(ctx, canvasId);

  const createdIds: string[] = [];
  for (const edge of edges) {
    if (edge.source === edge.target) {
      throw new ConvexError(errors.EDGE_SELF_CONNECTION_NOT_ALLOWED);
    }
    await requireLiveEndpointNode(ctx, {
      canvasId,
      nodeId: edge.source,
      error: errors.EDGE_SOURCE_NOT_FOUND,
    });
    await requireLiveEndpointNode(ctx, {
      canvasId,
      nodeId: edge.target,
      error: errors.EDGE_TARGET_NOT_FOUND,
    });

    let llmId = edge.id;
    if (llmId !== undefined) {
      const providedId = llmId;
      const existing = await ctx.db
        .query("edges")
        .withIndex("by_llmid", (q) => q.eq("id", providedId))
        .unique();
      if (existing) {
        if (existing.canvasId === canvasId) {
          createdIds.push(existing.id);
          continue;
        }
        throw new ConvexError(errors.EDGE_ID_ALREADY_TAKEN);
      }
    } else {
      llmId = await generateUniqueLlmId(ctx);
    }

    await ctx.db.insert("edges", {
      ...edge,
      id: llmId,
      markerEnd: edge.markerEnd ?? DEFAULT_MARKER_END,
    });
    createdIds.push(llmId);
  }

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, canvasId);
  }
  return createdIds;
}

/**
 * Patch `data` d'un edge, fusionné en shallow. `data` absent = no-op (retourne l'id sans écrire).
 * Retourne le llmId.
 */
export async function patchEdge(
  ctx: MutationCtx,
  {
    edgeId,
    data,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    edgeId: string;
    data?: Record<string, unknown>;
    touchCanvas?: boolean;
  },
): Promise<string> {
  const edge = await getEdgeOrThrow(ctx, { edgeId });

  if (data === undefined) return edge.id;

  await ctx.db.patch(edge._id, {
    data: { ...(edge.data ?? {}), ...data },
  });

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, edge.canvasId);
  }
  return edge.id;
}

export async function patchEdges(
  ctx: MutationCtx,
  {
    updates,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    updates: Array<EdgePatchUpdate>;
    touchCanvas?: boolean;
  },
): Promise<string[]> {
  if (updates.length === 0) return [];

  const edges = await Promise.all(
    updates.map((update) => getEdgeOrThrow(ctx, { edgeId: update.edgeId })),
  );
  const canvasId = requireSameCanvasId(edges.map((edge) => edge.canvasId));

  const edgeIds: string[] = [];
  for (const update of updates) {
    edgeIds.push(
      await patchEdge(ctx, {
        edgeId: update.edgeId,
        data: update.data,
        touchCanvas: false,
      }),
    );
  }

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, canvasId);
  }
  return edgeIds;
}

/**
 * Corbeille logique (soft delete) : `status = "trashed"` + `trashedAt`,
 * idempotent. Retourne le llmId.
 */
export async function trashEdge(
  ctx: MutationCtx,
  {
    edgeId,
    trashedAt = Date.now(),
    touchCanvas: shouldTouchCanvas = true,
  }: {
    edgeId: string;
    trashedAt?: number;
    touchCanvas?: boolean;
  },
): Promise<string> {
  const edge = await getEdgeOrThrow(ctx, { edgeId });
  if (edge.status === "trashed") return edge.id;

  await ctx.db.patch(edge._id, { status: "trashed", trashedAt });

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, edge.canvasId);
  }
  return edge.id;
}

/**
 * Sortie de corbeille, idempotent. Une edge dont une extrémité est toujours à
 * la corbeille est IGNORÉE plutôt que refusée : restaurer un node en rétablit
 * les connexions qu'il peut, et laisse dormir celles qui pointent vers un
 * voisin encore supprimé. Retourne les llmIds réellement remis en service.
 */
export async function untrashEdge(
  ctx: MutationCtx,
  {
    edgeId,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    edgeId: string;
    touchCanvas?: boolean;
  },
): Promise<string | null> {
  const edge = await getEdgeOrThrow(ctx, { edgeId });
  if (edge.status !== "trashed") return edge.id;

  const [sourceLives, targetLives] = await Promise.all([
    isLiveEndpointNode(ctx, {
      canvasId: edge.canvasId,
      nodeId: edge.source,
    }),
    isLiveEndpointNode(ctx, {
      canvasId: edge.canvasId,
      nodeId: edge.target,
    }),
  ]);
  if (!sourceLives || !targetLives) return null;

  await ctx.db.patch(edge._id, { status: undefined, trashedAt: undefined });

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, edge.canvasId);
  }
  return edge.id;
}

export async function untrashEdges(
  ctx: MutationCtx,
  {
    edgeIds,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    edgeIds: Array<string>;
    touchCanvas?: boolean;
  },
): Promise<string[]> {
  const uniqueIds = [...new Set(edgeIds)];
  if (uniqueIds.length === 0) return [];

  const edges = await Promise.all(
    uniqueIds.map((edgeId) => getEdgeOrThrow(ctx, { edgeId })),
  );
  const canvasId = requireSameCanvasId(edges.map((edge) => edge.canvasId));

  const untrashed: string[] = [];
  for (const edgeId of uniqueIds) {
    const restored = await untrashEdge(ctx, { edgeId, touchCanvas: false });
    if (restored !== null) untrashed.push(restored);
  }

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, canvasId);
  }
  return untrashed;
}

export async function trashEdges(
  ctx: MutationCtx,
  {
    edgeIds,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    edgeIds: Array<string>;
    touchCanvas?: boolean;
  },
): Promise<string[]> {
  const uniqueIds = [...new Set(edgeIds)];
  if (uniqueIds.length === 0) return [];

  const edges = await Promise.all(
    uniqueIds.map((edgeId) => getEdgeOrThrow(ctx, { edgeId })),
  );
  const canvasId = requireSameCanvasId(edges.map((edge) => edge.canvasId));

  const trashedAt = Date.now();
  const trashed: string[] = [];
  for (const edgeId of uniqueIds) {
    trashed.push(await trashEdge(ctx, { edgeId, trashedAt, touchCanvas: false }));
  }

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, canvasId);
  }
  return trashed;
}

/**
 * Cascade trash : corbeille toutes les edges vivantes qui touchent un des
 * nodes donnés. Ne touche pas le canvas — l'appelant (`trashNodes`) s'en
 * charge une fois pour tout.
 */
export async function trashEdgesTouchingNodes(
  ctx: MutationCtx,
  {
    canvasId,
    nodeIds,
    trashedAt = Date.now(),
  }: {
    canvasId: Id<"canvases">;
    nodeIds: Array<string>;
    trashedAt?: number;
  },
): Promise<string[]> {
  if (nodeIds.length === 0) return [];

  const nodeIdsSet = new Set(nodeIds);
  const edges = await ctx.db
    .query("edges")
    .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
    .collect();

  const trashed: string[] = [];
  for (const edge of edges) {
    if (edge.status === "trashed") continue;
    if (!nodeIdsSet.has(edge.source) && !nodeIdsSet.has(edge.target)) continue;
    await ctx.db.patch(edge._id, { status: "trashed", trashedAt });
    trashed.push(edge.id);
  }
  return trashed;
}

/**
 * Rend les edges mises à la corbeille EN MÊME TEMPS qu'un lot de nodes —
 * appariement sur l'égalité exacte de `trashedAt`, que `trashNodes` pose une
 * fois pour toute sa transaction.
 *
 * C'est ce qui distingue « les connexions parties avec ce node », qu'on veut
 * rendre, de « les connexions que l'utilisateur avait supprimées avant », qu'on
 * doit laisser dormir. Voie de la modale corbeille, qui ne connaît que des
 * nodes ; l'undo du canvas, lui, nomme ses edges (il les tient de
 * `deleteElements`).
 */
export async function untrashEdgesTrashedWith(
  ctx: MutationCtx,
  {
    canvasId,
    nodeIds,
    trashedAt,
  }: {
    canvasId: Id<"canvases">;
    nodeIds: Array<string>;
    trashedAt: number;
  },
): Promise<string[]> {
  if (nodeIds.length === 0) return [];

  const nodeIdsSet = new Set(nodeIds);
  const edges = await ctx.db
    .query("edges")
    .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
    .collect();

  const candidates = edges.filter(
    (edge) =>
      edge.status === "trashed" &&
      edge.trashedAt === trashedAt &&
      (nodeIdsSet.has(edge.source) || nodeIdsSet.has(edge.target)),
  );

  const restored: string[] = [];
  for (const edge of candidates) {
    const result = await untrashEdge(ctx, {
      edgeId: edge.id,
      touchCanvas: false,
    });
    if (result !== null) restored.push(result);
  }
  return restored;
}

/**
 * Purge un lot d'edges à la corbeille depuis plus de `TRASH_RETENTION_MS`.
 * Pendant de `NodeModels.purgeTrashedBatch`, sans cascade : une edge ne
 * possède rien. Retourne `true` si le lot était plein.
 */
export async function purgeTrashedBatch(ctx: MutationCtx): Promise<boolean> {
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  const expired = await ctx.db
    .query("edges")
    .withIndex("by_status_and_trashedAt", (q) =>
      q.eq("status", "trashed").lt("trashedAt", cutoff),
    )
    .take(TRASH_PURGE_BATCH_SIZE);

  for (const edge of expired) {
    // Backfill paresseux, cf. `NodeModels.purgeTrashedBatch`. Vital ici : une
    // edge à la corbeille n'a JAMAIS rien perdu (le trash d'edge n'a jamais
    // cascadé), donc la purger d'emblée faute de `trashedAt` serait une vraie
    // perte de données, pas le ménage d'une coquille vide.
    if (edge.trashedAt === undefined) {
      await ctx.db.patch(edge._id, { trashedAt: Date.now() });
      continue;
    }
    await ctx.db.delete(edge._id);
  }

  return expired.length === TRASH_PURGE_BATCH_SIZE;
}

export async function listFromCanvas(
  ctx: QueryCtx | MutationCtx,
  { canvasId }: { canvasId: Id<"canvases"> },
): Promise<EdgeDoc[]> {
  const edges = await ctx.db
    .query("edges")
    .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
    .collect();
  // L'index `by_canvas` trie par `_creationTime` : l'ordre chronologique
  // d'ajout est préservé (requis par `imageGeneration` — l'ordre des edges
  // = l'ordre des références).
  return edges.filter((edge) => edge.status !== "trashed");
}
