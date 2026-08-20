import { query, mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import { resolveUserDisplayName } from "./lib/userDisplayName";
import errors from "./config/errorsConfig";

export const shareCanvas = mutation({
  args: {
    canvasId: v.id("canvases"),
    email: v.string(),
    permission: v.union(v.literal("viewer"), v.literal("editor")),
  },
  returns: v.id("shares"),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    // Seul l'owner peut partager
    await requireCanvasAccess(ctx, args.canvasId, authUserId, "owner");

    // Chercher l'utilisateur par email
    const targetUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();

    if (!targetUser) {
      throw new ConvexError(errors.EMAIL_NOT_FOUND);
    }

    // Ne pas partager avec soi-même
    if (targetUser._id === authUserId) {
      throw new ConvexError(errors.SHARING_WITH_SELF);
    }

    // Vérifier si un partage existe déjà
    const existing = await ctx.db
      .query("shares")
      .withIndex("by_canvas_and_user", (q) =>
        q.eq("canvasId", args.canvasId).eq("userId", targetUser._id),
      )
      .unique();

    if (existing) {
      // Mettre à jour la permission
      await ctx.db.patch(existing._id, { permission: args.permission });
      return existing._id;
    }

    return await ctx.db.insert("shares", {
      resourceType: "canvas",
      canvasId: args.canvasId,
      userId: targetUser._id,
      permission: args.permission,
      grantedBy: authUserId,
    });
  },
});

export const unshareCanvas = mutation({
  args: {
    shareId: v.id("shares"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    const share = await ctx.db.get(args.shareId);
    if (!share) return null;

    // Seul l'owner peut retirer un partage
    await requireCanvasAccess(ctx, share.canvasId, authUserId, "owner");

    await ctx.db.delete(share._id);

    return null;
  },
});

export const listCanvasShares = query({
  args: {
    canvasId: v.id("canvases"),
  },
  returns: v.array(
    v.object({
      _id: v.id("shares"),
      userId: v.id("users"),
      userName: v.string(),
      userEmail: v.union(v.string(), v.null()),
      permission: v.union(v.literal("viewer"), v.literal("editor")),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    // Seul l'owner voit les partages
    await requireCanvasAccess(ctx, args.canvasId, authUserId, "owner");

    const shares = await ctx.db
      .query("shares")
      .withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
      .collect();

    // Enrichir avec les infos user
    const results = await Promise.all(
      shares.map(async (share) => {
        const user = await ctx.db.get(share.userId);
        return {
          _id: share._id,
          userId: share.userId,
          userName:
            resolveUserDisplayName(user) ?? user?.email ?? "Unknown user",
          userEmail: user?.email ?? null,
          permission: share.permission,
          createdAt: share._creationTime,
        };
      }),
    );

    return results;
  },
});
