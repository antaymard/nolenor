import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { NodeDataVersionActor } from "../schemas/nodeDataVersionsSchema";
import { requireActiveCanvas } from "../lib/auth";

type UserCanvasListItem = {
  _id: Id<"canvases">;
  name: string;
  description?: string;
  shared?: boolean;
  permission?: "viewer" | "editor";
  updatedAt: number;
  /** Nombre de blocs, pour l'afficher sans charger le canvas. */
  nodeCount: number;
};

async function getCanvasOrThrow(
  ctx: QueryCtx | MutationCtx,
  canvasId: Id<"canvases">,
): Promise<Doc<"canvases">> {
  return requireActiveCanvas(ctx, canvasId);
}

export async function getLastModifiedForUser(
  ctx: QueryCtx,
  { authUserId }: { authUserId: Id<"users"> },
): Promise<Doc<"canvases"> | null> {
  return await ctx.db
    .query("canvases")
    .withIndex("by_creator_and_updatedAt", (q) => q.eq("creatorId", authUserId))
    .order("desc")
    .first();
}

export async function listUserCanvasesWithShares(
  ctx: QueryCtx,
  { authUserId }: { authUserId: Id<"users"> },
): Promise<Array<UserCanvasListItem>> {
  const ownCanvases = await ctx.db
    .query("canvases")
    .withIndex("by_creator_and_updatedAt", (q) => q.eq("creatorId", authUserId))
    .order("desc")
    .collect();

  const shares = await ctx.db
    .query("shares")
    .withIndex("by_user", (q) => q.eq("userId", authUserId))
    .collect();

  const sharedCanvases = await Promise.all(
    shares
      .filter((share) => share.resourceType === "canvas")
      .map(async (share) => {
        const canvas = await ctx.db.get("canvases", share.canvasId);
        if (!canvas) return null;
        return {
          _id: canvas._id,
          name: canvas.name,
          shared: true as const,
          permission: share.permission,
          updatedAt: canvas.updatedAt,
          nodeCount: canvas.nodes?.length ?? 0,
        };
      }),
  );

  return [
    // Les deux listes sont triées par récence, mais séparément : l'appelant
    // qui les affiche l'une sous l'autre (sidebar, home) n'a rien à retrier,
    // et celui qui les sépare garde chaque section dans le bon ordre.
    ...ownCanvases.map((canvas) => ({
      _id: canvas._id,
      name: canvas.name,
      description: canvas.description,
      updatedAt: canvas.updatedAt,
      nodeCount: canvas.nodes?.length ?? 0,
    })),
    ...sharedCanvases
      .filter((canvas) => canvas !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  ];
}

export async function readCanvasById(
  ctx: QueryCtx,
  { canvasId }: { canvasId: Id<"canvases"> },
): Promise<Doc<"canvases">> {
  return await getCanvasOrThrow(ctx, canvasId);
}

export async function setCanvasPublicState(
  ctx: MutationCtx,
  {
    canvasId,
    isPublic,
  }: {
    canvasId: Id<"canvases">;
    isPublic: boolean;
  },
): Promise<null> {
  await getCanvasOrThrow(ctx, canvasId);

  await ctx.db.patch("canvases", canvasId, {
    isPublic,
    updatedAt: Date.now(),
  });

  return null;
}

export async function createCanvasForUser(
  ctx: MutationCtx,
  {
    authUserId,
    name,
    description,
  }: {
    authUserId: Id<"users">;
    name: string;
    description?: string;
  },
): Promise<Id<"canvases">> {
  return await ctx.db.insert("canvases", {
    creatorId: authUserId,
    name,
    description,
    nodes: [],
    edges: [],
    nodeCount: 0,
    graphRevision: 0,
    graphMigrated: true,
    updatedAt: Date.now(),
  });
}

export async function updateCanvasDetails(
  ctx: MutationCtx,
  {
    canvasId,
    name,
    description,
  }: {
    canvasId: Id<"canvases">;
    name: string;
    description?: string;
  },
): Promise<Id<"canvases">> {
  await getCanvasOrThrow(ctx, canvasId);

  await ctx.db.patch("canvases", canvasId, {
    name,
    description,
    updatedAt: Date.now(),
  });

  return canvasId;
}

export async function setCanvasBackground(
  ctx: MutationCtx,
  {
    canvasId,
    background,
  }: {
    canvasId: Id<"canvases">;
    background: NonNullable<Doc<"canvases">["background"]>;
  },
): Promise<Id<"canvases">> {
  await getCanvasOrThrow(ctx, canvasId);

  await ctx.db.patch("canvases", canvasId, {
    background,
    updatedAt: Date.now(),
  });

  return canvasId;
}

export async function deleteCanvasAndShares(
  ctx: MutationCtx,
  {
    canvasId,
    actor,
  }: {
    canvasId: Id<"canvases">;
    // Attribution des snapshots de suppression (versioning) ; system par défaut.
    actor?: NodeDataVersionActor;
  },
): Promise<Id<"canvases">> {
  // A keeps physical parent deletion. Scheduling and deletion commit together;
  // a retry can also resume cleanup of a parent that is already gone.
  const canvas = await ctx.db.get("canvases", canvasId);
  if (canvas) await ctx.db.delete("canvases", canvasId);
  await ctx.scheduler.runAfter(0, internal.canvasGraphCleanup.purgeCanvas, {
    canvasId,
    actor,
  });
  return canvasId;
}
