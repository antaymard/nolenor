import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import errors from "../config/errorsConfig";
import { generateLlmId } from "../lib/llmId";
import * as NodeDataModels from "./nodeDataModels";
import * as ThreadMetadataModels from "./threadMetadataModels";
import type { NodeDataVersionActor } from "../schemas/nodeDataVersionsSchema";
import { threadNodeTouchKinds } from "../schemas/threadMetadataSchema";

type NodeDoc = Doc<"nodes">;

/** Champs du node fournis par l'appelant : tout sauf clés système, `id` (llmId généré ici) et `nodeDataId`. */
export type NodeCreateInput = Omit<
  NodeDoc,
  "_id" | "_creationTime" | "id" | "nodeDataId" | "status"
>;

const MAX_LLMID_ATTEMPTS = 5;

async function getCanvasOrThrow(
  ctx: MutationCtx,
  canvasId: Id<"canvases">,
): Promise<Doc<"canvases">> {
  const canvas = await ctx.db.get("canvases", canvasId);
  if (!canvas) throw new ConvexError(errors.CANVAS_NOT_FOUND);
  return canvas;
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
 * Retourne le llmId (contrat public `nodes.createWithNodeData`).
 */
export async function createNode(
  ctx: MutationCtx,
  {
    node,
    nodeDataId,
  }: {
    node: NodeCreateInput;
    nodeDataId: Id<"nodeDatas">;
  },
): Promise<string> {
  await getCanvasOrThrow(ctx, node.canvasId);

  const llmId = await generateUniqueLlmId(ctx);

  await ctx.db.insert("nodes", {
    ...node,
    id: llmId,
    nodeDataId,
  });

  // Patch updatedAt of the canvas
  await ctx.db.patch("canvases", node.canvasId, {
    updatedAt: Date.now(),
  });

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
  }: {
    node: NodeCreateInput;
    values: Record<string, unknown>;
    templateId?: Id<"nodeTemplates">;
    actor?: NodeDataVersionActor;
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

  const nodeId = await createNode(ctx, { node, nodeDataId });
  return { nodeId, nodeDataId };
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
 * Corbeille logique (soft delete) : `status = "trashed"`, idempotent.
 * Le nodeData et les chunks sont conservés (restauration possible).
 * Retourne le llmId.
 */
export async function trashNode(
  ctx: MutationCtx,
  { nodeId }: { nodeId: string },
): Promise<string> {
  const node = await getNodeOrThrow(ctx, { nodeId });
  if (node.status === "trashed") return node.id;

  await ctx.db.patch(node._id, { status: "trashed" });

  await ctx.db.patch("canvases", node.canvasId, {
    updatedAt: Date.now(),
  });

  return node.id;
}
