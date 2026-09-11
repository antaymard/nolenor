import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import errors from "../config/errorsConfig";
import { nodeDataConfig } from "../config/nodeConfig";
import {
  TRASH_PURGE_BATCH_SIZE,
  TRASH_RETENTION_MS,
} from "../config/trashConfig";
import { generateLlmId } from "../lib/llmId";
import * as CanvasModels from "./canvasModels";
import * as EdgeModels from "./edgeModels";
import * as NodeDataModels from "./nodeDataModels";
import * as SearchableChunkModels from "./searchableChunkModels";
import * as ThreadMetadataModels from "./threadMetadataModels";
import type { NodeDataVersionActor } from "../schemas/nodeDataVersionsSchema";
import type { NodePatchProps } from "../schemas/nodesSchema";
import type { CanvasNode } from "../schemas/nodesSchema";
import { threadNodeTouchKinds } from "../schemas/threadMetadataSchema";

type NodeDoc = Doc<"nodes">;

export function toCanvasNode(doc: NodeDoc): CanvasNode {
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
  "_id" | "_creationTime" | "id" | "nodeDataId" | "status" | "trashedAt"
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
 * Crée un node dans la table `nodes`. Sans `id`, génère le llmId côté
 * serveur avec contrôle d'unicité globale (`by_llmid`). Avec `id` (création local-first côté client), l'appelant
 * garantit l'unicité — `createNodeWithData` l'a vérifiée dans la même
 * transaction.
 * Retourne le llmId.
 */
export async function createNode(
  ctx: MutationCtx,
  {
    node,
    nodeDataId,
    id: providedId,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    node: NodeCreateInput;
    nodeDataId: Id<"nodeDatas">;
    id?: string;
    touchCanvas?: boolean;
  },
): Promise<string> {
  await getCanvasOrThrow(ctx, node.canvasId);

  const llmId = providedId ?? (await generateUniqueLlmId(ctx));
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
    id: providedId,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    node: NodeCreateInput;
    values: Record<string, unknown>;
    templateId?: Id<"nodeTemplates">;
    actor?: NodeDataVersionActor;
    id?: string;
    touchCanvas?: boolean;
  },
): Promise<{ nodeId: string; nodeDataId: Id<"nodeDatas"> }> {
  // Id fourni (création local-first côté client) : le check passe AVANT la
  // création du nodeData — sinon un retry idempotent en orphelinerait un.
  // Déjà en table sur le même canvas = mutation déjà commitée (retry réseau)
  // → on retourne l'existant sans rien écrire ; cross-canvas → collision
  // d'id refusée.
  if (providedId !== undefined) {
    const existing = await ctx.db
      .query("nodes")
      .withIndex("by_llmid", (q) => q.eq("id", providedId))
      .unique();
    if (existing) {
      if (existing.canvasId === node.canvasId) {
        return { nodeId: existing.id, nodeDataId: existing.nodeDataId };
      }
      throw new ConvexError(errors.NODE_ID_ALREADY_TAKEN);
    }
  }

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
    id: providedId,
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
      id?: string;
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
        id: item.id,
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

export async function getNodeOrThrow(
  ctx: QueryCtx | MutationCtx,
  { nodeId }: { nodeId: string },
): Promise<NodeDoc> {
  const node = await getNodeByLlmId(ctx, { nodeId });
  if (!node) throw new ConvexError(errors.NODE_NOT_FOUND);
  return node;
}

/**
 * Résolution inverse nodeDataId → node (1:1 en pratique). Premier trouvé,
 * `null` sinon.
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
 * `data` est fusionné en shallow, le reste est remplacé. Props vide = no-op (retourne l'id sans toucher
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
 * Corbeille logique (soft delete) : `status = "trashed"` + `trashedAt`,
 * idempotent. Rien n'est détruit — ni le nodeData, ni ses chunks, ni ses
 * blobs R2. C'est ce qui rend la suppression annulable (undo du canvas,
 * modale corbeille) ; la destruction réelle revient au cron `purgeTrashed`,
 * passé `TRASH_RETENTION_MS`.
 *
 * `trashedAt` est fourni par l'appelant batch pour que tout ce qui meurt dans
 * la même transaction porte la MÊME date : c'est cette égalité qui permet à
 * `untrashEdgesTrashedWith` de rendre exactement les edges parties avec un
 * node, sans ressusciter celles que l'utilisateur avait supprimées avant.
 * Retourne le llmId.
 */
export async function trashNode(
  ctx: MutationCtx,
  {
    nodeId,
    trashedAt = Date.now(),
    touchCanvas: shouldTouchCanvas = true,
  }: {
    nodeId: string;
    trashedAt?: number;
    touchCanvas?: boolean;
  },
): Promise<string> {
  const node = await getNodeOrThrow(ctx, { nodeId });
  if (node.status === "trashed") return node.id;

  await ctx.db.patch(node._id, { status: "trashed", trashedAt });

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, node.canvasId);
  }

  return node.id;
}

/**
 * Sortie de corbeille : l'exact inverse de `trashNode`, idempotent. Sert à la
 * fois l'undo du canvas (Mod+Z sur une suppression) et la restauration
 * manuelle depuis la modale corbeille — un seul chemin, donc un seul
 * comportement à garantir. Retourne le llmId.
 */
export async function untrashNode(
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
  if (node.status !== "trashed") return node.id;

  await ctx.db.patch(node._id, { status: undefined, trashedAt: undefined });

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, node.canvasId);
  }

  return node.id;
}

/**
 * Trash batch : mise à la corbeille des nodes et des edges qui les touchent,
 * 1 seul `touchCanvas`. Aucune destruction ici (cf. `trashNode`) — le
 * `deleteWithCascade` qui partait en `runAfter(0)` est passé au cron
 * `purgeTrashed`, sans quoi restaurer un node ne rendait qu'un cadre vide.
 *
 * La trace agent (`recordNodeTouch`) est en revanche posée MAINTENANT et pas
 * à la purge : l'événement qu'un thread veut voir, c'est « ce node a été
 * supprimé », pas le ménage anonyme trente jours plus tard. Elle vivait dans
 * `deleteWithCascade` (cf. `trackAgentTouch` dans nodeDataWrappers), qui ne
 * passe plus par là.
 */
export async function trashNodes(
  ctx: MutationCtx,
  {
    nodeIds,
    actor,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    nodeIds: Array<string>;
    actor?: NodeDataVersionActor;
    touchCanvas?: boolean;
  },
): Promise<string[]> {
  const uniqueIds = [...new Set(nodeIds)];
  if (uniqueIds.length === 0) return [];

  const nodes = await Promise.all(
    uniqueIds.map((nodeId) => getNodeOrThrow(ctx, { nodeId })),
  );
  const canvasId = requireSameCanvasId(nodes.map((node) => node.canvasId));

  // Une seule date pour toute la transaction — cf. `trashNode`.
  const trashedAt = Date.now();

  const trashed: string[] = [];
  for (const node of nodes) {
    trashed.push(
      await trashNode(ctx, {
        nodeId: node.id,
        trashedAt,
        touchCanvas: false,
      }),
    );
    if (node.status === "trashed") continue;
    if (actor?.type === "agent" && actor.threadId) {
      await ThreadMetadataModels.recordNodeTouch(ctx, {
        threadId: actor.threadId,
        nodeDataId: node.nodeDataId,
        kind: threadNodeTouchKinds.deleted,
      });
    }
  }

  // Cascade : les edges vivantes qui touchent un node trashé partent avec
  // lui. Tous les ids passés (déjà trashed inclus) — idempotent, et ça
  // rattrape au passage les edges restées vivantes par erreur sur un node
  // trashed avant cette cascade.
  await EdgeModels.trashEdgesTouchingNodes(ctx, {
    canvasId,
    nodeIds: nodes.map((node) => node.id),
    trashedAt,
  });

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, canvasId);
  }
  return trashed;
}

/**
 * Sortie de corbeille batch.
 *
 * `restoreIncidentEdges` rend en plus les edges parties AVEC ces nodes, et
 * elles seules : l'appariement se fait sur l'égalité de `trashedAt`, posé par
 * `trashNodes` pour toute la transaction. Sans ce critère, restaurer un node
 * ressusciterait aussi les connexions que l'utilisateur avait pris la peine
 * de supprimer séparément. C'est la voie de la modale corbeille, qui ne sait
 * rien des edges ; l'undo du canvas, lui, nomme ses edges explicitement
 * (il les tient de `deleteElements`).
 */
export async function untrashNodes(
  ctx: MutationCtx,
  {
    nodeIds,
    restoreIncidentEdges = false,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    nodeIds: Array<string>;
    restoreIncidentEdges?: boolean;
    touchCanvas?: boolean;
  },
): Promise<{ nodeIds: string[]; edgeIds: string[] }> {
  const uniqueIds = [...new Set(nodeIds)];
  if (uniqueIds.length === 0) return { nodeIds: [], edgeIds: [] };

  const nodes = await Promise.all(
    uniqueIds.map((nodeId) => getNodeOrThrow(ctx, { nodeId })),
  );
  const canvasId = requireSameCanvasId(nodes.map((node) => node.canvasId));

  // Les dates de mise à la corbeille sont lues AVANT le untrash, qui les
  // efface.
  const trashedAts = [
    ...new Set(
      nodes.flatMap((node) =>
        node.status === "trashed" && node.trashedAt !== undefined
          ? [node.trashedAt]
          : [],
      ),
    ),
  ];

  const untrashedNodeIds: string[] = [];
  for (const node of nodes) {
    untrashedNodeIds.push(
      await untrashNode(ctx, { nodeId: node.id, touchCanvas: false }),
    );
  }

  const untrashedEdgeIds: string[] = [];
  if (restoreIncidentEdges) {
    for (const trashedAt of trashedAts) {
      untrashedEdgeIds.push(
        ...(await EdgeModels.untrashEdgesTrashedWith(ctx, {
          canvasId,
          nodeIds: untrashedNodeIds,
          trashedAt,
        })),
      );
    }
  }

  if (shouldTouchCanvas) {
    await CanvasModels.touchCanvas(ctx, canvasId);
  }
  return { nodeIds: untrashedNodeIds, edgeIds: untrashedEdgeIds };
}

/** Les nodes à la corbeille d'un canvas, du plus récemment jeté au plus ancien. */
export async function listTrashedFromCanvas(
  ctx: QueryCtx | MutationCtx,
  { canvasId }: { canvasId: Id<"canvases"> },
): Promise<NodeDoc[]> {
  const nodes = await ctx.db
    .query("nodes")
    .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
    .collect();
  return nodes
    .filter((node) => node.status === "trashed")
    .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
}

/**
 * Purge un lot de nodes à la corbeille depuis plus de `TRASH_RETENTION_MS` :
 * la ligne `nodes` part, et son nodeData avec (chunks, mémoires, blobs R2) via
 * `deleteWithCascade`. Retourne `true` si le lot était plein — l'appelant doit
 * alors se re-scheduler. Même forme que `NodeDataVersionModels.pruneExpiredBatch`.
 */
export async function purgeTrashedBatch(ctx: MutationCtx): Promise<boolean> {
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  const expired = await ctx.db
    .query("nodes")
    .withIndex("by_status_and_trashedAt", (q) =>
      q.eq("status", "trashed").lt("trashedAt", cutoff),
    )
    .take(TRASH_PURGE_BATCH_SIZE);

  for (const node of expired) {
    // Backfill paresseux. Une ligne jetée avant l'existence du champ n'a pas
    // de `trashedAt`, et `undefined` trie AVANT tout nombre dans un index
    // Convex : elle tombe donc dans la fenêtre de purge dès le premier
    // passage du cron. On lui accorde ses 30 jours ici plutôt que dans une
    // migration — et le patch la sort de la plage `< cutoff`, donc pas de
    // boucle.
    if (node.trashedAt === undefined) {
      await ctx.db.patch(node._id, { trashedAt: Date.now() });
      continue;
    }
    await ctx.scheduler.runAfter(
      0,
      internal.wrappers.nodeDataWrappers.deleteWithCascade,
      { nodeDataId: node.nodeDataId },
    );
    await ctx.db.delete(node._id);
  }

  return expired.length === TRASH_PURGE_BATCH_SIZE;
}

/**
 * Déplace des nodes vers un autre canvas : les edges de la table `edges`
 * qui touchent un node déplacé sont supprimées (pas migrées). nodeData +
 * chunks suivent le canvas.
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
