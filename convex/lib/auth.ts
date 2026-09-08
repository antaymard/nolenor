import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import errors from "../config/errorsConfig";

// Pour les mutations - throw si non authentifié (catch côté front)
export async function requireAuth(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    throw new ConvexError(errors.UNAUTHORIZED_USER);
  } else return userId;
}

export async function optionalAuth(ctx: QueryCtx | MutationCtx | ActionCtx) {
  return await getAuthUserId(ctx);
}

export type CanvasPermission = "viewer" | "editor" | "owner";

type CanvasAccessResult = {
  canvas: Doc<"canvases">;
  permission: CanvasPermission;
};

type RequireCanvasAccessOptions = {
  allowPublic?: boolean;
};

// Integrity guard for internal writers too; authorization stays with the caller.
export async function requireActiveCanvas(
  ctx: QueryCtx | MutationCtx,
  canvasId: Id<"canvases">,
): Promise<Doc<"canvases">> {
  const canvas = await ctx.db.get("canvases", canvasId);
  if (!canvas || canvas.deletedAt !== undefined) {
    throw new ConvexError(errors.CANVAS_NOT_FOUND);
  }
  return canvas;
}

/**
 * Vérifie l'accès d'un user à un canvas.
 * Retourne { canvas, permission } ou null si aucun accès.
 */
export async function getCanvasAccess(
  ctx: QueryCtx | MutationCtx,
  canvasId: Id<"canvases">,
  userId: Id<"users">,
): Promise<CanvasAccessResult | null> {
  const canvas = await ctx.db.get(canvasId);
  if (!canvas || canvas.deletedAt !== undefined) return null;

  // Owner = full access
  if (canvas.creatorId === userId) return { canvas, permission: "owner" };

  // Check shares
  const share = await ctx.db
    .query("shares")
    .withIndex("by_canvas_and_user", (q) =>
      q.eq("canvasId", canvasId).eq("userId", userId),
    )
    .unique();

  if (!share) return null;
  return { canvas, permission: share.permission };
}

/**
 * Vérifie que l'user a au moins le niveau de permission requis sur le canvas.
 * Throw si canvas introuvable ou non autorisé. Retourne le canvas + permission.
 */
export async function requireCanvasAccess(
  ctx: QueryCtx | MutationCtx,
  canvasId: Id<"canvases">,
  userId: Id<"users"> | null,
  minPermission: CanvasPermission = "viewer",
  options: RequireCanvasAccessOptions = {},
): Promise<CanvasAccessResult> {
  const { allowPublic = false } = options;

  const canvas = await requireActiveCanvas(ctx, canvasId);

  let access: CanvasAccessResult | null = null;
  if (userId) {
    access = await getCanvasAccess(ctx, canvasId, userId);
  }

  const levels: Record<CanvasPermission, number> = {
    viewer: 0,
    editor: 1,
    owner: 2,
  };

  if (access) {
    if (levels[access.permission] >= levels[minPermission]) {
      return access;
    }

    if (allowPublic && minPermission === "viewer" && canvas.isPublic === true) {
      return { canvas, permission: "viewer" };
    }

    throw new ConvexError(errors.INSUFFICIENT_PERMISSIONS);
  }

  if (allowPublic && minPermission === "viewer" && canvas.isPublic === true) {
    return { canvas, permission: "viewer" };
  }

  throw new ConvexError(errors.CANVAS_NOT_FOUND);
}
