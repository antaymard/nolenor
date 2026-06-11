import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import errors from "../config/errorsConfig";
import { internal } from "../_generated/api";

type UserCanvasListItem = {
  _id: Id<"canvases">;
  name: string;
  description?: string;
  shared?: boolean;
  permission?: "viewer" | "editor";
};

async function getCanvasOrThrow(
  ctx: QueryCtx | MutationCtx,
  canvasId: Id<"canvases">,
): Promise<Doc<"canvases">> {
  const canvas = await ctx.db.get("canvases", canvasId);
  if (!canvas) throw new ConvexError(errors.CANVAS_NOT_FOUND);
  return canvas;
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
    .withIndex("by_creator", (q) => q.eq("creatorId", authUserId))
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
        };
      }),
  );

  return [
    ...ownCanvases.map((canvas) => ({
      _id: canvas._id,
      name: canvas.name,
      description: canvas.description,
    })),
    ...sharedCanvases.filter((canvas) => canvas !== null),
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

export async function deleteCanvasAndShares(
  ctx: MutationCtx,
  { canvasId }: { canvasId: Id<"canvases"> },
): Promise<Id<"canvases">> {
  await getCanvasOrThrow(ctx, canvasId);

  const shares = await ctx.db
    .query("shares")
    .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
    .collect();

  for (const share of shares) {
    await ctx.db.delete(share._id);
  }

  const nodeDatas = await ctx.db
    .query("nodeDatas")
    .withIndex("by_canvasId", (q) => q.eq("canvasId", canvasId))
    .collect();
  for (const nodeData of nodeDatas) {
    await ctx.scheduler.runAfter(
      0,
      internal.wrappers.nodeDataWrappers.deleteWithCascade,
      { nodeDataId: nodeData._id },
    );
  }
  if (nodeDatas.length > 0) {
    console.log(
      `🗑️ Scheduled cascade deletion for ${nodeDatas.length} nodeDatas on canvas ${canvasId}`,
    );
  }

  // const tasks = await ctx.db
  //   .query("tasks")
  //   .withIndex("by_canvasId_and_status", (q) => q.eq("canvasId", canvasId))
  //   .collect();
  // for (const task of tasks) {
  //   await ctx.db.delete(task._id);
  // }

  await ctx.db.delete(canvasId);
  return canvasId;
}
