import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import errors from "./config/errorsConfig";
import * as CanvasBookmarkModels from "./models/canvasBookmarkModels";
import {
  bookmarkTargetValidator,
  canvasBookmarksValidator,
} from "./schemas/canvasBookmarksSchema";

const bookmarkDocValidator = v.object({
  _id: v.id("canvasBookmarks"),
  _creationTime: v.number(),
  ...canvasBookmarksValidator.fields,
});

/**
 * L'accès requis pour poser un repère sur un canvas.
 *
 * `viewer` et non `editor` : un bookmark est une note personnelle dans la marge,
 * il ne modifie rien du canvas. `allowPublic` pour qu'un utilisateur connecté
 * qui consulte un canvas public puisse s'y repérer aussi — un visiteur anonyme,
 * lui, est déjà arrêté par `requireAuth` en amont, faute de `userId` où
 * rattacher le repère.
 */
const BOOKMARK_CANVAS_ACCESS = {
  minPermission: "viewer",
  options: { allowPublic: true },
} as const;

/**
 * Charge un repère et vérifie qu'il appartient bien à l'appelant.
 *
 * L'accès au canvas ne donne aucun droit ici : les repères sont personnels, et
 * deux membres d'un canvas partagé ne doivent pas pouvoir se toucher les leurs.
 * La contrepartie est qu'on ne re-vérifie PAS l'accès au canvas sur les
 * écritures — sinon un partage révoqué enfermerait l'utilisateur avec des
 * repères qu'il ne pourrait plus ni voir ni supprimer.
 */
async function requireOwnBookmark(
  ctx: QueryCtx | MutationCtx,
  bookmarkId: Id<"canvasBookmarks">,
  authUserId: Id<"users">,
): Promise<Doc<"canvasBookmarks">> {
  const bookmark = await ctx.db.get("canvasBookmarks", bookmarkId);
  if (!bookmark) {
    throw new ConvexError(errors.BOOKMARK_NOT_FOUND);
  }
  if (bookmark.userId !== authUserId) {
    throw new ConvexError(errors.INSUFFICIENT_PERMISSIONS);
  }
  return bookmark;
}

export const listForCanvas = query({
  args: { canvasId: v.id("canvases") },
  returns: v.array(bookmarkDocValidator),
  handler: async (ctx, { canvasId }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(
      ctx,
      canvasId,
      authUserId,
      BOOKMARK_CANVAS_ACCESS.minPermission,
      BOOKMARK_CANVAS_ACCESS.options,
    );

    return await CanvasBookmarkModels.listForUserCanvas(ctx, {
      userId: authUserId,
      canvasId,
    });
  },
});

export const create = mutation({
  args: {
    canvasId: v.id("canvases"),
    label: v.optional(v.string()),
    target: bookmarkTargetValidator,
  },
  returns: v.id("canvasBookmarks"),
  handler: async (ctx, { canvasId, label, target }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(
      ctx,
      canvasId,
      authUserId,
      BOOKMARK_CANVAS_ACCESS.minPermission,
      BOOKMARK_CANVAS_ACCESS.options,
    );

    return await CanvasBookmarkModels.create(ctx, {
      userId: authUserId,
      canvasId,
      label,
      target,
    });
  },
});

export const rename = mutation({
  args: {
    bookmarkId: v.id("canvasBookmarks"),
    // `null` rend le repère à son titre vivant (cf. `label` dans le schéma).
    label: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { bookmarkId, label }) => {
    const authUserId = await requireAuth(ctx);
    await requireOwnBookmark(ctx, bookmarkId, authUserId);

    return await CanvasBookmarkModels.rename(ctx, { bookmarkId, label });
  },
});

export const reorder = mutation({
  args: { orderedIds: v.array(v.id("canvasBookmarks")) },
  returns: v.null(),
  handler: async (ctx, { orderedIds }) => {
    const authUserId = await requireAuth(ctx);
    if (orderedIds.length === 0) return null;

    // Chaque id est vérifié, pas seulement le premier : un réordonnancement
    // n'a de sens que dans une liste, c'est-à-dire un seul canvas et un seul
    // propriétaire. Sans ce garde-fou, un appel forgé mélangeant deux canvases
    // renumeroterait deux listes à la fois.
    const bookmarks = await Promise.all(
      orderedIds.map((bookmarkId) =>
        requireOwnBookmark(ctx, bookmarkId, authUserId),
      ),
    );
    const canvasId = bookmarks[0].canvasId;
    for (const bookmark of bookmarks) {
      if (bookmark.canvasId !== canvasId) {
        throw new ConvexError(errors.BOOKMARKS_MUST_SHARE_CANVAS);
      }
    }

    return await CanvasBookmarkModels.reorder(ctx, { orderedIds });
  },
});

export const remove = mutation({
  args: { bookmarkId: v.id("canvasBookmarks") },
  returns: v.null(),
  handler: async (ctx, { bookmarkId }) => {
    const authUserId = await requireAuth(ctx);
    await requireOwnBookmark(ctx, bookmarkId, authUserId);

    return await CanvasBookmarkModels.remove(ctx, { bookmarkId });
  },
});
