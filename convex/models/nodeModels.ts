import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import errors from "../config/errorsConfig";
import { FRAME_CONTENT_PADDING, nodeDataConfig } from "../config/nodeConfig";
import {
  TRASH_PURGE_BATCH_SIZE,
  TRASH_RETENTION_MS,
} from "../config/trashConfig";
import { generateLlmId } from "../lib/llmId";
import { frameZIndexBelow } from "../lib/nodeLayering";
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

/**
 * Plafond des non-membres englobés rapportés par `createFrameAroundNodes` :
 * c'est un signalement, pas un inventaire, et un groupement autour de deux
 * nodes au milieu d'un amas en trouverait des dizaines.
 */
const ENCLOSED_NON_MEMBERS_REPORTED = 10;

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

  // L'appartenance à une frame se validait dans `patchNode` et pas ici : on
  // pouvait donc CRÉER un node rattaché à n'importe quoi — `parentId` est dans
  // `nodeCreateInputValidator`, et rien ne le regardait. Or l'appartenance
  // porte la cascade de suppression : un `parentId` qui désigne n'importe quoi
  // emporterait n'importe quoi avec lui. C'est le seul `insert("nodes")` du
  // repo, une garde ici suffit.
  //
  // `llmId` et pas `providedId` : la création local-first fournit l'id, et le
  // test « son propre parent » doit la couvrir aussi. Une levée annule toute la
  // mutation, `nodeData` compris — les mutations Convex sont transactionnelles,
  // rien ne peut rester orphelin.
  if (node.parentId !== undefined) {
    await assertCanBeChildOf(
      ctx,
      { id: llmId, type: node.type, canvasId: node.canvasId },
      node.parentId,
    );
  }

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
 * Les nodes que ces frames contiennent, corbeille comprise.
 *
 * Pas d'index sur `parentId` : on balaie le canvas et on filtre, exactement
 * comme `listFromCanvas`. C'est déjà la granularité de lecture de tout ce qui
 * touche au canvas ici, et un index de plus ne se justifierait qu'à partir du
 * moment où l'appartenance se lirait sans le reste du canvas.
 *
 * Les nodes à la corbeille sont inclus : les appelants sont les cascades de
 * `trash` et `untrash`, qui ont précisément besoin de les voir.
 */
export async function listChildren(
  ctx: QueryCtx | MutationCtx,
  { canvasId, parentIds }: { canvasId: Id<"canvases">; parentIds: string[] },
): Promise<NodeDoc[]> {
  if (parentIds.length === 0) return [];
  const wanted = new Set(parentIds);
  const nodes = await ctx.db
    .query("nodes")
    .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
    .collect();
  return nodes.filter(
    (node) => node.parentId !== undefined && wanted.has(node.parentId),
  );
}

/**
 * Trace une frame autour de nodes existants, et les y fait entrer.
 *
 * Une seule mutation, là où le client en fait deux : il crée la frame, attend
 * la confirmation serveur, puis reparente (cf. `useFrameDrawTool`). C'est la
 * frontière réseau qui l'y oblige — `parentId` désigne un llmId, et un patch
 * qui pointe sur un node que le serveur ne connaît pas est rejeté. Ici, dans
 * une seule transaction, `patchNodes` relit l'insert de trois lignes plus haut.
 *
 * Et surtout : l'agent n'a aucun tool pour réparer. Ni corbeille, ni
 * déplacement, ni dégroupement — et ses écritures n'entrent dans aucune pile
 * d'annulation. Un groupement à moitié fait resterait à moitié fait. D'où le
 * tout-ou-rien : on valide l'ENSEMBLE des ids avant d'écrire quoi que ce soit,
 * et on lève sur le premier qui ne va pas plutôt que de l'écarter en silence.
 * Écarter donnerait une boîte qui ne correspond pas à ce qui a été demandé,
 * sans que l'appelant puisse le voir.
 *
 * Les positions sont lues telles quelles, sans passer par `absolutePosition` :
 * « déjà dans une frame » est un cas de rejet, donc tous les membres sont de
 * premier niveau et leur `position` EST leur position monde.
 */
export async function createFrameAroundNodes(
  ctx: MutationCtx,
  {
    canvasId,
    nodeIds,
    values,
    color,
    padding = FRAME_CONTENT_PADDING,
    actor,
  }: {
    canvasId: Id<"canvases">;
    nodeIds: string[];
    /** Le `nodeData` de la frame : son titre et le niveau de celui-ci. */
    values: Record<string, unknown>;
    color?: string;
    padding?: number;
    actor?: NodeDataVersionActor;
  },
): Promise<{
  frameId: string;
  nodeDataId: Id<"nodeDatas">;
  memberIds: string[];
  position: { x: number; y: number };
  width: number;
  height: number;
  /**
   * Les nodes libres que la boîte contient entièrement SANS être membres. Ils
   * ont l'air groupés — la frame est derrière eux — et ne le sont pas. Rapporté
   * à l'appelant, pas corrigé : la liste des membres est ce qui a été demandé.
   */
  enclosedNonMembers: string[];
}> {
  // Dédoublonnage silencieux, comme `trashNodes` : répéter un id n'est pas une
  // erreur, c'est juste sans effet.
  const uniqueIds = [...new Set(nodeIds)];
  if (uniqueIds.length < 2) {
    throw new ConvexError(errors.FRAME_NEEDS_TWO_NODES);
  }

  // UNE lecture pour tout : la résolution des ids, le contrôle de canvas (un id
  // d'ailleurs est simplement introuvable ici), le filtre corbeille, la bande de
  // peinture des frames et le balayage des non-membres englobés.
  const canvasNodes = await listFromCanvas(ctx, { canvasId });
  const byId = new Map(canvasNodes.map((node) => [node.id, node]));

  const members: NodeDoc[] = [];
  const unknown: string[] = [];
  for (const nodeId of uniqueIds) {
    const node = byId.get(nodeId);
    if (!node) {
      unknown.push(nodeId);
      continue;
    }
    members.push(node);
  }
  if (unknown.length > 0) {
    throw new ConvexError(
      `${errors.NODE_NOT_FOUND} Unknown on this canvas: ${unknown.join(", ")}.`,
    );
  }

  const nested = members.filter((node) => node.type === "frame");
  if (nested.length > 0) {
    throw new ConvexError(
      `${errors.FRAME_CANNOT_BE_NESTED} Offending: ${nested
        .map((node) => node.id)
        .join(", ")}.`,
    );
  }

  const taken = members.filter((node) => node.parentId !== undefined);
  if (taken.length > 0) {
    throw new ConvexError(
      `${errors.NODE_ALREADY_IN_A_FRAME} Already grouped: ${taken
        .map((node) => node.id)
        .join(", ")}.`,
    );
  }

  const left = Math.min(...members.map((node) => node.position.x)) - padding;
  const top = Math.min(...members.map((node) => node.position.y)) - padding;
  const right =
    Math.max(...members.map((node) => node.position.x + node.width)) + padding;
  const bottom =
    Math.max(...members.map((node) => node.position.y + node.height)) + padding;
  const position = { x: left, y: top };
  const width = right - left;
  const height = bottom - top;

  const memberIds = new Set(members.map((node) => node.id));
  const enclosedNonMembers = canvasNodes
    .filter(
      (node) =>
        !memberIds.has(node.id) &&
        node.type !== "frame" &&
        node.parentId === undefined &&
        node.position.x >= left &&
        node.position.y >= top &&
        node.position.x + node.width <= right &&
        node.position.y + node.height <= bottom,
    )
    .map((node) => node.id)
    .slice(0, ENCLOSED_NON_MEMBERS_REPORTED);

  const { nodeId: frameId, nodeDataId } = await createNodeWithData(ctx, {
    node: {
      canvasId,
      type: "frame",
      position,
      width,
      height,
      // Sous tous les nodes et sous les frames déjà posées : sans ça la frame
      // naîtrait à 0, dans la bande ordinaire, et son fond recouvrirait les
      // nodes qui ne sont pas à elle et qui traînent sous sa boîte.
      zIndex: frameZIndexBelow(canvasNodes),
      ...(color !== undefined && { color }),
    },
    values,
    actor,
    touchCanvas: false,
  });

  // `patchNodes` et pas un `db.patch` à la main : il rejoue `assertCanBeChildOf`
  // pour chaque membre, donc l'invariant n'a qu'un seul point d'application.
  await patchNodes(ctx, {
    updates: members.map((node) => ({
      nodeId: node.id,
      props: {
        parentId: frameId,
        // Les positions d'un enfant sont relatives à sa frame.
        position: {
          x: node.position.x - position.x,
          y: node.position.y - position.y,
        },
      },
    })),
    touchCanvas: false,
  });

  await CanvasModels.touchCanvas(ctx, canvasId);

  return {
    frameId,
    nodeDataId,
    memberIds: members.map((node) => node.id),
    position,
    width,
    height,
    enclosedNonMembers,
  };
}

/**
 * Crée un node DANS une frame, et agrandit la frame s'il n'y tient pas.
 *
 * Une transaction pour les deux : une frame plus petite que son contenu est un
 * état que le client tient déjà pour invalide — c'est son plancher de
 * redimensionnement — donc elle ne doit jamais exister, pas même le temps d'un
 * aller-retour.
 *
 * Elle grandit par le BAS et par la DROITE, coin haut gauche fixe. C'est ce qui
 * rend l'opération sans effet de bord : les positions des enfants sont relatives
 * à ce coin, donc aucune n'a à être recalculée, et le titre, posé au-dessus du
 * bord haut, ne bouge pas.
 *
 * L'écriture passe par `db.patch` et pas par `patchNodes` : ce dernier vérifie
 * que les nodes nommés partagent UN canvas, pas celui de l'appelant. Ici la
 * frame a déjà été résolue sur `canvasId`, l'ambiguïté n'existe pas.
 */
export async function createNodeInFrame(
  ctx: MutationCtx,
  {
    canvasId,
    frameId,
    node,
    values,
    templateId,
    padding = FRAME_CONTENT_PADDING,
    actor,
  }: {
    canvasId: Id<"canvases">;
    frameId: string;
    /** `position` RELATIVE à la frame, comme tout enfant la porte. */
    node: Omit<NodeCreateInput, "parentId">;
    values: Record<string, unknown>;
    templateId?: Id<"nodeTemplates">;
    padding?: number;
    actor?: NodeDataVersionActor;
  },
): Promise<{
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  frame: { width: number; height: number; grown: boolean };
}> {
  const frame = await getNodeOrThrow(ctx, { nodeId: frameId });
  if (frame.type !== "frame" || frame.canvasId !== canvasId) {
    throw new ConvexError(errors.NODE_PARENT_MUST_BE_A_FRAME);
  }

  const created = await createNodeWithData(ctx, {
    node: { ...node, canvasId, parentId: frameId },
    values,
    templateId,
    actor,
    touchCanvas: false,
  });

  const width = Math.max(frame.width, node.position.x + node.width + padding);
  const height = Math.max(frame.height, node.position.y + node.height + padding);
  const grown = width !== frame.width || height !== frame.height;
  if (grown) {
    await ctx.db.patch(frame._id, { width, height });
  }

  await CanvasModels.touchCanvas(ctx, canvasId);

  return { ...created, frame: { width, height, grown } };
}

/**
 * Un node peut-il être rattaché à ce parent ?
 *
 * Trois règles, vérifiées ici et pas seulement dans l'UI : `nodes.patch` est
 * public, et l'appartenance porte la cascade de suppression — un `parentId`
 * qui désigne n'importe quoi emporterait n'importe quoi avec lui.
 *
 * Une frame ne peut pas avoir de parent (pas de frame dans une frame), ce qui
 * exclut du même coup tout cycle : la relation n'a qu'un seul niveau par
 * construction, il n'y a pas de chaîne dans laquelle boucler.
 */
async function assertCanBeChildOf(
  ctx: QueryCtx | MutationCtx,
  // Un sous-ensemble structurel et pas un `NodeDoc` : la création doit valider
  // AVANT l'insert, donc avant qu'il existe un doc. Les trois champs lus sont
  // les trois seuls dont la règle dépend.
  node: { id?: string; type: NodeDoc["type"]; canvasId: Id<"canvases"> },
  parentId: string,
): Promise<void> {
  if (node.type === "frame") {
    throw new ConvexError(errors.FRAME_CANNOT_BE_NESTED);
  }
  if (parentId === node.id) {
    throw new ConvexError(errors.NODE_PARENT_MUST_BE_A_FRAME);
  }
  const parent = await getNodeByLlmId(ctx, { nodeId: parentId });
  if (!parent || parent.type !== "frame") {
    throw new ConvexError(errors.NODE_PARENT_MUST_BE_A_FRAME);
  }
  if (parent.canvasId !== node.canvasId) {
    throw new ConvexError(errors.NODES_MUST_SHARE_CANVAS);
  }
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

  if (props.parentId !== undefined && props.parentId !== null) {
    await assertCanBeChildOf(ctx, node, props.parentId);
  }

  const patch: Partial<Omit<NodeDoc, "_id" | "_creationTime">> = {};
  if (props.position !== undefined) patch.position = props.position;
  if (props.width !== undefined) patch.width = props.width;
  if (props.height !== undefined) patch.height = props.height;
  if (props.locked !== undefined) patch.locked = props.locked;
  if (props.hidden !== undefined) patch.hidden = props.hidden;
  if (props.zIndex !== undefined) patch.zIndex = props.zIndex;
  if (props.color !== undefined) patch.color = props.color;
  if (props.variant !== undefined) patch.variant = props.variant;
  // `null` (sortir de la frame) devient `undefined`, que `db.patch` traduit
  // par « retirer le champ ». `undefined` en entrée ne passe pas ce test : ne
  // rien dire sur `parentId` laisse l'appartenance intacte.
  if (props.parentId !== undefined) patch.parentId = props.parentId ?? undefined;
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
 *
 * Un node dont la frame n'est pas revenue avec lui en ressort libre : c'est le
 * cas de la modale corbeille, où on peut restaurer un enfant seul. React Flow
 * refuse de rendre un node dont le parent est absent (il le dit dans la
 * console et le laisse invisible), donc le rendre « dans » une frame qui
 * n'existe plus reviendrait à ne pas le rendre du tout.
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

  const parent = node.parentId
    ? await getNodeByLlmId(ctx, { nodeId: node.parentId })
    : null;
  const losesItsFrame =
    node.parentId !== undefined && (!parent || parent.status === "trashed");

  await ctx.db.patch(node._id, {
    status: undefined,
    trashedAt: undefined,
    ...(losesItsFrame && {
      parentId: undefined,
      // Sa position était relative à la frame : telle quelle, elle se lirait
      // désormais en coordonnées monde et le node réapparaîtrait près de
      // l'origine. On la repasse en absolu — sauf si la frame a été purgée,
      // auquel cas il ne reste rien pour le faire.
      position: parent
        ? {
            x: parent.position.x + node.position.x,
            y: parent.position.y + node.position.y,
          }
        : node.position,
    }),
  });

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

  const named = await Promise.all(
    uniqueIds.map((nodeId) => getNodeOrThrow(ctx, { nodeId })),
  );
  const canvasId = requireSameCanvasId(named.map((node) => node.canvasId));

  // Supprimer une frame, c'est supprimer son contenu : elle n'a pas d'autre
  // substance que ce qu'elle groupe, la laisser partir seule abandonnerait des
  // nodes rattachés à un parent disparu — que React Flow ne sait pas rendre.
  //
  // `deleteElements` côté client remonte déjà les enfants, donc ce chemin ne
  // se voit que depuis l'agent, MCP, ou toute suppression qui ne passe pas par
  // le canvas. Idempotent : les enfants déjà nommés par l'appelant sont
  // dédupliqués juste après.
  const namedIds = new Set(named.map((node) => node.id));
  const children = await listChildren(ctx, {
    canvasId,
    parentIds: named
      .filter((node) => node.type === "frame")
      .map((node) => node.id),
  });
  const nodes = [
    ...named,
    ...children.filter((child) => !namedIds.has(child.id)),
  ];

  // Une seule date pour toute la transaction — cf. `trashNode`. C'est cette
  // égalité qui permettra à `untrashNodes` de rendre exactement les enfants
  // partis AVEC leur frame.
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
 *
 * `restoreChildren` fait la même chose pour le contenu d'une frame, sur le
 * même critère et pour la même raison : rendre une frame doit rendre ce qui
 * est parti avec elle, pas ce que l'utilisateur avait supprimé dedans avant.
 */
export async function untrashNodes(
  ctx: MutationCtx,
  {
    nodeIds,
    restoreIncidentEdges = false,
    restoreChildren = false,
    touchCanvas: shouldTouchCanvas = true,
  }: {
    nodeIds: Array<string>;
    restoreIncidentEdges?: boolean;
    restoreChildren?: boolean;
    touchCanvas?: boolean;
  },
): Promise<{ nodeIds: string[]; edgeIds: string[] }> {
  const uniqueIds = [...new Set(nodeIds)];
  if (uniqueIds.length === 0) return { nodeIds: [], edgeIds: [] };

  const named = await Promise.all(
    uniqueIds.map((nodeId) => getNodeOrThrow(ctx, { nodeId })),
  );
  const canvasId = requireSameCanvasId(named.map((node) => node.canvasId));

  // Les enfants partis avec leur frame reviennent avec elle : appariement sur
  // l'égalité exacte de `trashedAt`, que `trashNodes` pose une fois pour toute
  // sa transaction. Un node supprimé dans la frame AVANT qu'elle ne parte a
  // une autre date, et reste donc à la corbeille.
  const namedIds = new Set(named.map((node) => node.id));
  const restoredChildren = restoreChildren
    ? (
        await listChildren(ctx, {
          canvasId,
          parentIds: named
            .filter((node) => node.type === "frame")
            .map((node) => node.id),
        })
      ).filter(
        (child) =>
          !namedIds.has(child.id) &&
          child.status === "trashed" &&
          named.some(
            (parent) =>
              parent.id === child.parentId &&
              parent.trashedAt !== undefined &&
              parent.trashedAt === child.trashedAt,
          ),
      )
    : [];
  const nodes = [...named, ...restoredChildren];

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

  // Les frames d'abord : `untrashNode` libère un node dont la frame est
  // encore à la corbeille, et l'undo d'une suppression nomme frame et enfants
  // dans l'ordre où `deleteElements` les a rendus — rien ne garantit que la
  // frame y vienne en premier. Sans ce tri, annuler la suppression d'une frame
  // en ressortirait le contenu.
  const parentsFirst = [
    ...nodes.filter((node) => node.type === "frame"),
    ...nodes.filter((node) => node.type !== "frame"),
  ];

  const untrashedNodeIds: string[] = [];
  for (const node of parentsFirst) {
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
 *
 * Une frame emmène son contenu, et un node qui laisse sa frame derrière lui en
 * ressort libre : `parentId` ne traverse pas les canvas, il désignerait un
 * node resté sur l'autre.
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

  const named = await Promise.all(
    uniqueIds.map((nodeId) => getNodeOrThrow(ctx, { nodeId })),
  );
  const sourceCanvasId = requireSameCanvasId(
    named.map((node) => node.canvasId),
  );
  if (sourceCanvasId === targetCanvasId) {
    throw new ConvexError(errors.SOURCE_AND_TARGET_CANVAS_MUST_BE_DIFFERENT);
  }

  await getCanvasOrThrow(ctx, targetCanvasId);

  // Déplacer une frame déplace ce qu'elle contient : la laisser partir seule
  // ne lui laisserait rien à montrer, et abandonnerait des nodes rattachés à
  // un parent devenu hors canvas.
  const namedIds = new Set(named.map((node) => node.id));
  const children = await listChildren(ctx, {
    canvasId: sourceCanvasId,
    parentIds: named
      .filter((node) => node.type === "frame")
      .map((node) => node.id),
  });
  const nodes = [
    ...named,
    ...children.filter((child) => !namedIds.has(child.id)),
  ];

  const movedIds = new Set(nodes.map((node) => node.id));

  for (const node of nodes) {
    // Le node part sans sa frame : sa position redevient absolue, sinon il
    // atterrirait près de l'origine du canvas d'accueil. La frame est relue
    // ici et pas cherchée parmi les déplacés — par définition elle n'en est
    // pas, c'est tout le problème.
    const orphaned =
      node.parentId !== undefined && !movedIds.has(node.parentId);
    const frame = orphaned
      ? await getNodeByLlmId(ctx, { nodeId: node.parentId as string })
      : null;

    await ctx.db.patch(node._id, {
      canvasId: targetCanvasId,
      ...(orphaned && {
        parentId: undefined,
        position: frame
          ? {
              x: frame.position.x + node.position.x,
              y: frame.position.y + node.position.y,
            }
          : node.position,
      }),
    });
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
