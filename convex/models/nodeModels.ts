import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import errors from "../config/errorsConfig";
import { nodeDataConfig } from "../config/nodeConfig";
import { generateLlmId } from "../lib/llmId";
import * as CanvasModels from "./canvasModels";
import * as EdgeModels from "./edgeModels";
import * as NodeDataModels from "./nodeDataModels";
import * as SearchableChunkModels from "./searchableChunkModels";
import * as ThreadMetadataModels from "./threadMetadataModels";
import type { NodeDataVersionActor } from "../schemas/nodeDataVersionsSchema";
import type { NodePatchProps } from "../schemas/nodesSchema";
import { threadNodeTouchKinds } from "../schemas/threadMetadataSchema";

type NodeDoc = Doc<"nodes">;

export type CanvasNodeShape = {
  id: string;
  nodeDataId?: Id<"nodeDatas">;
  type: NodeDoc["type"];
  position: { x: number; y: number };
  width: number;
  height: number;
  locked?: boolean;
  hidden?: boolean;
  zIndex?: number;
  color?: string;
  variant?: string;
  parentId?: string;
  extent?: NodeDoc["extent"];
  extendParent?: boolean;
  data?: Record<string, unknown>;
};

export function toCanvasNode(doc: NodeDoc): CanvasNodeShape {
  return {
    id: doc.id,
    nodeDataId: doc.nodeDataId,
    type: doc.type,
    position: doc.position,
    width: doc.width,
    height: doc.height,
    ...(doc.locked !== undefined && { locked: doc.locked }),
    ...(doc.hidden !== undefined && { hidden: doc.hidden }),
    ...(doc.zIndex !== undefined && { zIndex: doc.zIndex }),
    ...(doc.color !== undefined && { color: doc.color }),
    ...(doc.variant !== undefined && { variant: doc.variant }),
    ...(doc.parentId !== undefined && { parentId: doc.parentId }),
    ...(doc.extent !== undefined && { extent: doc.extent }),
    ...(doc.extendParent !== undefined && { extendParent: doc.extendParent }),
    ...(doc.data !== undefined && { data: doc.data }),
  };
}

/** Champs du node fournis par l'appelant : tout sauf clés système, `id` (llmId généré ici) et `nodeDataId`. */
export type NodeCreateInput = Omit<
  NodeDoc,
  "_id" | "_creationTime" | "id" | "nodeDataId" | "status"
>;

const MAX_LLMID_ATTEMPTS = 5;

function requireSameCanvasId(
  canvasIds: Array<Id<"canvases">>,
): Id<"canvases"> {
  const first = canvasIds[0];
  if (first === undefined) {
    throw new ConvexError(errors.NODE_NOT_FOUND);
  }
  for (const canvasId of canvasIds) {
    if (canvasId !== first) {
      throw new ConvexError(errors.NODES_MUST_SHARE_CANVAS);
    }
  }
  return first;
}

async function getCanvasOrThrow(
  ctx: MutationCtx,
  canvasId: Id<"canvases">,
): Promise<Doc<"canvases">> {
  const canvas = await ctx.db.get("canvases", canvasId);
  if (!canvas) throw new ConvexError(errors.CANVAS_NOT_FOUND);
  return canvas;
}

function withDefaultVariant(node: NodeCreateInput): NodeCreateInput {
  if (node.variant !== undefined) return node;
  const config = nodeDataConfig.find((item) => item.type === node.type);
  if (!config?.variants) return node;
  const defaultVariantKey = Object.entries(config.variants).find(
    ([, variant]) => variant.isDefault,
  )?.[0];
  if (!defaultVariantKey) return node;
  return { ...node, variant: defaultVariantKey };
}

async function generateUniqueLlmId(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < MAX_LLMID_ATTEMPTS; attempt++) {
    const candidate = generateLlmId();
    const existing = await ctx.db
      .query("nodes")
      .withIndex("by_llmid", (q) => q.eq("id", candidate))
      .unique();
    if (!existing) return candidate;
  }
  throw new ConvexError("Could not generate a unique node id, please retry.");
}

/**
 * Crée un node dans la table `nodes` (pas de double-écriture `canvases.nodes`).
 * Génère le llmId côté serveur avec contrôle d'unicité globale (`by_llmid`).
 * Retourne le llmId.
 */
export async function createNode(
  ctx: MutationCtx,
  {
    node,
    nodeDataId,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    node: NodeCreateInput;
    nodeDataId: Id<"nodeDatas">;
    touchCanvas?: boolean;
  },
): Promise<string> {
  await getCanvasOrThrow(ctx, node.canvasId);

  const llmId = await generateUniqueLlmId(ctx);
  const withVariant = withDefaultVariant(node);

  await ctx.db.insert("nodes", {
    ...withVariant,
    id: llmId,
    nodeDataId,
  });

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, node.canvasId);
  }

  return llmId;
}

/**
 * Orchestrateur node + nodeData : point de passage UNIQUE des créations
 * (mutation publique `nodes.createWithNodeData` et wrapper interne de l'agent).
 *
 * Fait les deux inserts dans la même transaction + le tracking agent
 * (rattache le node au thread, verbe `created`) — ce tracking vit dans
 * `nodeDataWrappers.create` pour la voie nodeData seul, il est donc répliqué
 * ici plutôt que contourné. Voir le commentaire de `trackAgentTouch` là-bas.
 */
export async function createNodeWithData(
  ctx: MutationCtx,
  {
    node,
    values,
    templateId,
    actor,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    node: NodeCreateInput;
    values: Record<string, unknown>;
    templateId?: Id<"nodeTemplates">;
    actor?: NodeDataVersionActor;
    touchCanvas?: boolean;
  },
): Promise<{ nodeId: string; nodeDataId: Id<"nodeDatas"> }> {
  const nodeDataId = await NodeDataModels.createNodeData(ctx, {
    type: node.type,
    values,
    canvasId: node.canvasId,
    templateId,
  });

  // Update associated threads
  if (actor?.type === "agent" && actor.threadId) {
    await ThreadMetadataModels.recordNodeTouch(ctx, {
      threadId: actor.threadId,
      nodeDataId,
      kind: threadNodeTouchKinds.created,
    });
  }

  const nodeId = await createNode(ctx, {
    node,
    nodeDataId,
    touchCanvas: shouldTouchCanvas,
  });
  return { nodeId, nodeDataId };
}

export async function createNodesWithData(
  ctx: MutationCtx,
  {
    nodes,
    actor,
  }: {
    nodes: Array<{
      node: NodeCreateInput;
      values: Record<string, unknown>;
      templateId?: Id<"nodeTemplates">;
    }>;
    actor?: NodeDataVersionActor;
  },
): Promise<Array<{ nodeId: string; nodeDataId: Id<"nodeDatas"> }>> {
  if (nodes.length === 0) return [];

  const canvasId = requireSameCanvasId(nodes.map((item) => item.node.canvasId));

  const created = [];
  for (const item of nodes) {
    created.push(
      await createNodeWithData(ctx, {
        node: item.node,
        values: item.values,
        templateId: item.templateId,
        actor,
        touchCanvas: false,
      }),
    );
  }

  await CanvasModels.touchCanvas(ctx, canvasId);
  return created;
}

export async function getNodeByLlmId(
  ctx: QueryCtx | MutationCtx,
  { nodeId }: { nodeId: string },
): Promise<NodeDoc | null> {
  return await ctx.db
    .query("nodes")
    .withIndex("by_llmid", (q) => q.eq("id", nodeId))
    .unique();
}

type LayoutNodeInput = {
  id: string;
  nodeDataId?: Id<"nodeDatas">;
  type: NodeDoc["type"];
  position: { x: number; y: number };
  width: number;
  height: number;
  locked?: boolean;
  hidden?: boolean;
  zIndex?: number;
  color?: string;
  variant?: string;
  parentId?: string;
  extent?: NodeDoc["extent"];
  extendParent?: boolean;
  data?: Record<string, unknown>;
};

export async function upsertLayoutNode(
  ctx: MutationCtx,
  {
    canvasId,
    node,
  }: {
    canvasId: Id<"canvases">;
    node: LayoutNodeInput;
  },
): Promise<void> {
  if (!node.nodeDataId) return;

  const existing = await getNodeByLlmId(ctx, { nodeId: node.id });
  if (existing?.status === "trashed") return;

  const fields: Omit<NodeDoc, "_id" | "_creationTime" | "status"> = {
    id: node.id,
    canvasId,
    nodeDataId: node.nodeDataId,
    type: node.type,
    position: node.position,
    width: node.width,
    height: node.height,
  };
  if (node.locked !== undefined) fields.locked = node.locked;
  if (node.hidden !== undefined) fields.hidden = node.hidden;
  if (node.zIndex !== undefined) fields.zIndex = node.zIndex;
  if (node.color !== undefined) fields.color = node.color;
  if (node.variant !== undefined) fields.variant = node.variant;
  if (node.parentId !== undefined) fields.parentId = node.parentId;
  if (node.extent !== undefined) fields.extent = node.extent;
  if (node.extendParent !== undefined) fields.extendParent = node.extendParent;
  if (node.data !== undefined) fields.data = node.data;

  if (existing) {
    const { id: _llmId, ...patch } = fields;
    await ctx.db.patch(existing._id, patch);
    return;
  }

  await ctx.db.insert("nodes", fields);
}

export async function getNodeOrThrow(
  ctx: QueryCtx | MutationCtx,
  { nodeId }: { nodeId: string },
): Promise<NodeDoc> {
  const node = await getNodeByLlmId(ctx, { nodeId });
  if (!node) throw new ConvexError(errors.NODE_NOT_FOUND);
  return node;
}

/**
 * Résolution inverse nodeDataId → node (1:1 en pratique). Premier trouvé :
 * table `nodes` d'abord, `null` sinon (l'appelant tente le monde legacy).
 */
export async function getNodeByNodeDataId(
  ctx: QueryCtx | MutationCtx,
  { nodeDataId }: { nodeDataId: Id<"nodeDatas"> },
): Promise<NodeDoc | null> {
  return await ctx.db
    .query("nodes")
    .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
    .first();
}

export async function listFromCanvas(
  ctx: QueryCtx | MutationCtx,
  { canvasId }: { canvasId: Id<"canvases"> },
): Promise<NodeDoc[]> {
  const nodes = await ctx.db
    .query("nodes")
    .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
    .collect();
  return nodes.filter((node) => node.status !== "trashed");
}

/**
 * Patch des props visuelles/positionnelles d'un node (couleur, position,
 * dimensions, verrouillage, …). Seuls les champs fournis sont écrits ;
 * `data` est fusionné en shallow (parité avec le legacy `updateCanvasNodes`),
 * le reste est remplacé. Props vide = no-op (retourne l'id sans toucher
 * `canvases.updatedAt`). Retourne le llmId.
 */
export async function patchNode(
  ctx: MutationCtx,
  {
    nodeId,
    props,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    nodeId: string;
    props: NodePatchProps;
    touchCanvas?: boolean;
  },
): Promise<string> {
  const node = await getNodeOrThrow(ctx, { nodeId });

  const patch: Partial<Omit<NodeDoc, "_id" | "_creationTime">> = {};
  if (props.position !== undefined) patch.position = props.position;
  if (props.width !== undefined) patch.width = props.width;
  if (props.height !== undefined) patch.height = props.height;
  if (props.locked !== undefined) patch.locked = props.locked;
  if (props.hidden !== undefined) patch.hidden = props.hidden;
  if (props.zIndex !== undefined) patch.zIndex = props.zIndex;
  if (props.color !== undefined) patch.color = props.color;
  if (props.variant !== undefined) patch.variant = props.variant;
  if (props.parentId !== undefined) patch.parentId = props.parentId;
  if (props.extent !== undefined) patch.extent = props.extent;
  if (props.extendParent !== undefined)
    patch.extendParent = props.extendParent;
  if (props.data !== undefined) {
    patch.data = { ...(node.data ?? {}), ...props.data };
  }

  if (Object.keys(patch).length === 0) return node.id;

  await ctx.db.patch(node._id, patch);

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, node.canvasId);
  }

  return node.id;
}

export async function patchNodes(
  ctx: MutationCtx,
  {
    updates,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    updates: Array<{ nodeId: string; props: NodePatchProps }>;
    touchCanvas?: boolean;
  },
): Promise<string[]> {
  if (updates.length === 0) return [];

  const nodes = await Promise.all(
    updates.map((update) => getNodeOrThrow(ctx, { nodeId: update.nodeId })),
  );
  const canvasId = requireSameCanvasId(nodes.map((node) => node.canvasId));

  const nodeIds: string[] = [];
  for (const update of updates) {
    nodeIds.push(
      await patchNode(ctx, {
        nodeId: update.nodeId,
        props: update.props,
        touchCanvas: false,
      }),
    );
  }

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, canvasId);
  }
  return nodeIds;
}

/**
 * Corbeille logique (soft delete) : `status = "trashed"`, idempotent.
 * Le nodeData est ensuite supprimé en cascade (chunks, R2), comme le legacy
 * `remove` — la ligne `nodes` reste pour un undo layout plus tard.
 * Retourne le llmId.
 */
export async function trashNode(
  ctx: MutationCtx,
  {
    nodeId,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    nodeId: string;
    touchCanvas?: boolean;
  },
): Promise<string> {
  const node = await getNodeOrThrow(ctx, { nodeId });
  if (node.status === "trashed") return node.id;

  await ctx.db.patch(node._id, { status: "trashed" });

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, node.canvasId);
  }

  return node.id;
}

/**
 * Trash batch + cascades : nodeData (chunks, R2) via scheduler, et les edges
 * de la table `edges` qui touchent un node trashé. 1 seul `touchCanvas`.
 */
export async function trashNodes(
  ctx: MutationCtx,
  {
    nodeIds,
    actor,
  }: {
    nodeIds: Array<string>;
    actor?: NodeDataVersionActor;
  },
): Promise<string[]> {
  const uniqueIds = [...new Set(nodeIds)];
  if (uniqueIds.length === 0) return [];

  const nodes = await Promise.all(
    uniqueIds.map((nodeId) => getNodeOrThrow(ctx, { nodeId })),
  );
  const canvasId = requireSameCanvasId(nodes.map((node) => node.canvasId));

  const trashed: string[] = [];
  for (const node of nodes) {
    trashed.push(await trashNode(ctx, { nodeId: node.id, touchCanvas: false }));
    if (node.status === "trashed") continue;
    await ctx.scheduler.runAfter(
      0,
      internal.wrappers.nodeDataWrappers.deleteWithCascade,
      { nodeDataId: node.nodeDataId, actor },
    );
  }

  // Cascade : les edges vivantes qui touchent un node trashé partent avec
  // lui. Tous les ids passés (déjà trashed inclus) — idempotent, et ça
  // rattrape au passage les edges restées vivantes par erreur sur un node
  // trashed avant cette cascade.
  await EdgeModels.trashEdgesTouchingNodes(ctx, {
    canvasId,
    nodeIds: nodes.map((node) => node.id),
  });

  await CanvasModels.touchCanvas(ctx, canvasId);
  return trashed;
}

/**
 * Déplace des nodes vers un autre canvas. Parité legacy `moveToCanvas` :
 * les edges de la table `edges` qui touchent un node déplacé sont
 * supprimées (pas migrées). nodeData + chunks suivent le canvas.
 */
export async function moveNodes(
  ctx: MutationCtx,
  {
    nodeIds,
    targetCanvasId,
  }: {
    nodeIds: Array<string>;
    targetCanvasId: Id<"canvases">;
  },
): Promise<string[]> {
  const uniqueIds = [...new Set(nodeIds)];
  if (uniqueIds.length === 0) return [];

  const nodes = await Promise.all(
    uniqueIds.map((nodeId) => getNodeOrThrow(ctx, { nodeId })),
  );
  const sourceCanvasId = requireSameCanvasId(
    nodes.map((node) => node.canvasId),
  );
  if (sourceCanvasId === targetCanvasId) {
    throw new ConvexError(errors.SOURCE_AND_TARGET_CANVAS_MUST_BE_DIFFERENT);
  }

  await getCanvasOrThrow(ctx, targetCanvasId);

  const movedIds = new Set(nodes.map((node) => node.id));

  for (const node of nodes) {
    await ctx.db.patch(node._id, { canvasId: targetCanvasId });
    await ctx.db.patch(node.nodeDataId, { canvasId: targetCanvasId });
    await SearchableChunkModels.updateCanvasId(ctx, {
      nodeDataId: node.nodeDataId,
      canvasId: targetCanvasId,
    });
  }

  const edges = await ctx.db
    .query("edges")
    .withIndex("by_canvas", (q) => q.eq("canvasId", sourceCanvasId))
    .collect();
  for (const edge of edges) {
    if (movedIds.has(edge.source) || movedIds.has(edge.target)) {
      await ctx.db.delete(edge._id);
    }
  }

  await CanvasModels.touchCanvas(ctx, sourceCanvasId);
  await CanvasModels.touchCanvas(ctx, targetCanvasId);
  return nodes.map((node) => node.id);
}
