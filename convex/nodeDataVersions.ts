import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { getThreadMetadata } from "@convex-dev/agent";
import { optionalAuth, requireAuth, requireCanvasAccess } from "./lib/auth";
import * as NodeDataModels from "./models/nodeDataModels";
import * as NodeDataVersionModels from "./models/nodeDataVersionModels";
import type { NodeDataVersionActor } from "./schemas/nodeDataVersionsSchema";

// Historique d'un node : métadonnées seules, sans les `values` potentiellement
// volumineuses (cf. read pour un snapshot complet). Les versions survivent à
// la suppression du node : l'accès est alors contrôlé via le canvas enregistré
// sur la dernière version.
export const listByNodeDataId = query({
  args: { nodeDataId: v.id("nodeDatas") },
  handler: async (ctx, { nodeDataId }) => {
    const authUserId = await optionalAuth(ctx);

    const nodeData = await ctx.db.get(nodeDataId);
    let canvasId = nodeData?.canvasId;
    if (!canvasId) {
      const latest = await ctx.db
        .query("nodeDataVersions")
        .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
        .order("desc")
        .first();
      if (!latest) return [];
      canvasId = latest.canvasId;
    }
    await requireCanvasAccess(ctx, canvasId, authUserId, "viewer", {
      allowPublic: true,
    });

    return NodeDataVersionModels.listByNodeDataId(ctx, { nodeDataId });
  },
});

export const read = query({
  args: { versionId: v.id("nodeDataVersions") },
  handler: async (ctx, { versionId }) => {
    const authUserId = await optionalAuth(ctx);

    const version = await ctx.db.get(versionId);
    if (!version) return null;

    const nodeData = await ctx.db.get(version.nodeDataId);
    await requireCanvasAccess(
      ctx,
      nodeData?.canvasId ?? version.canvasId,
      authUserId,
      "viewer",
      { allowPublic: true },
    );

    return version;
  },
});

export const restore = mutation({
  args: { versionId: v.id("nodeDataVersions") },
  returns: v.boolean(),
  handler: async (ctx, { versionId }): Promise<boolean> => {
    const authUserId = await requireAuth(ctx);

    const version = await ctx.db.get(versionId);
    if (!version) throw new ConvexError("Version not found");

    // v1 : pas de restauration d'un node supprimé (il faudrait recréer le
    // nodeData et le node de canvas associé).
    const nodeData = await ctx.db.get(version.nodeDataId);
    if (!nodeData) throw new ConvexError("NodeData not found");
    await requireCanvasAccess(ctx, nodeData.canvasId, authUserId, "editor");

    const actor: NodeDataVersionActor = { type: "user", userId: authUserId };

    // Checkpoint forcé de l'état courant AVANT d'écrire : le restore est ainsi
    // lui-même annulable. L'updateValues qui suit coalesce ce checkpoint (même
    // acteur, âge 0, read-your-writes) — ne pas inverser l'ordre.
    await NodeDataVersionModels.maybeCheckpoint(ctx, {
      nodeData,
      actor,
      changedKeys: Object.keys(version.values),
      trigger: "restore",
      force: true,
    });

    return NodeDataModels.updateValues(ctx, {
      _id: nodeData._id,
      values: version.values,
      actor,
    });
  },
});

// Purge TTL en lots, re-schedulée tant qu'il reste des versions expirées.
// Déclenchée par le cron quotidien (convex/crons.ts), exécutable à la main
// depuis le dashboard.
export const pruneExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const hasMore = await NodeDataVersionModels.pruneExpiredBatch(ctx);
    if (hasMore) {
      await ctx.scheduler.runAfter(
        0,
        internal.nodeDataVersions.pruneExpired,
        {},
      );
    }
    return null;
  },
});

export const getThreadsThatCreatedVersions = query({
  args: {
    nodeDataId: v.id("nodeDatas"),
  },
  handler: async (ctx, { nodeDataId }) => {
    const authUserId = await optionalAuth(ctx);

    // Accès aligné sur listByNodeDataId : fallback sur le canvas de la dernière
    // version si le node a été supprimé (les versions lui survivent).
    const nodeData = await ctx.db.get(nodeDataId);
    let canvasId = nodeData?.canvasId;
    if (!canvasId) {
      const latest = await ctx.db
        .query("nodeDataVersions")
        .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
        .order("desc")
        .first();
      if (!latest) return [];
      canvasId = latest.canvasId;
    }
    await requireCanvasAccess(ctx, canvasId, authUserId, "viewer", {
      allowPublic: true,
    });

    const versions = await NodeDataVersionModels.listByNodeDataId(ctx, {
      nodeDataId,
    });

    if (!versions || !versions.length) return [];

    // threadIds uniques des versions créées par un agent. flatMap (et non
    // filter().map()) pour que TS narrow le variant `agent` : `threadId`
    // n'existe pas sur les variants `user`/`system` de l'union actor.
    const threadIds = [
      ...new Set(
        versions.flatMap((version) =>
          version.actor.type === "agent" && version.actor.threadId
            ? [version.actor.threadId]
            : [],
        ),
      ),
    ];

    if (!threadIds.length) return [];

    const threads = await Promise.all(
      threadIds.map((threadId) =>
        getThreadMetadata(ctx, components.agent, { threadId }),
      ),
    );

    // Pas de filtrage par propriétaire du thread : sur un canvas partagé, un
    // viewer doit voir tous les threads IA ayant modifié le node. On écarte
    // seulement les threads supprimés (null).
    return threads.flatMap((thread) =>
      thread === null
        ? []
        : [
            {
              _id: thread._id,
              _creationTime: thread._creationTime,
              title: thread.title ?? null,
              summary: thread.summary ?? null,
              // Seuls les threads de l'utilisateur courant sont réellement
              // ouvrables (listMessages/getThreadInfo exigent l'appartenance).
              isOwner: authUserId !== null && thread.userId === authUserId,
            },
          ],
    );
  },
});
