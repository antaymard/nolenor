import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import errors from "../config/errorsConfig";
import type { BookmarkTarget } from "../schemas/canvasBookmarksSchema";

type CanvasBookmark = Doc<"canvasBookmarks">;

/**
 * Plafond de nodes visés par un repère `selection`.
 *
 * Un lasso ramasse vite quelques centaines de nodes, et un repère qui vise tout
 * le canvas ne repère plus rien. La borne protège aussi le document : c'est le
 * seul champ de la table dont la taille dépend de ce que fait l'utilisateur.
 */
export const MAX_SELECTION_NODE_IDS = 100;

/** L'écart entre deux `sortOrder` consécutifs à la création. */
const SORT_ORDER_STEP = 1;

async function getBookmarkOrThrow(
  ctx: QueryCtx | MutationCtx,
  bookmarkId: Id<"canvasBookmarks">,
): Promise<CanvasBookmark> {
  const bookmark = await ctx.db.get("canvasBookmarks", bookmarkId);
  if (!bookmark) {
    throw new ConvexError(errors.BOOKMARK_NOT_FOUND);
  }
  return bookmark;
}

/**
 * Normalise une cible avant écriture.
 *
 * Une `selection` vide n'est pas un repère : elle serait affichée d'office comme
 * morte et ne mènerait nulle part. Les doublons partent aussi — `fitView` s'en
 * moque, mais ils gonflent le document et faussent le « N nodes » affiché.
 */
function normalizeTarget(target: BookmarkTarget): BookmarkTarget {
  if (target.kind !== "selection") return target;

  const nodeIds = [...new Set(target.nodeIds)].slice(0, MAX_SELECTION_NODE_IDS);
  if (nodeIds.length === 0) {
    throw new ConvexError(errors.BOOKMARK_EMPTY_SELECTION);
  }
  return { kind: "selection", nodeIds };
}

export async function listForUserCanvas(
  ctx: QueryCtx,
  { userId, canvasId }: { userId: Id<"users">; canvasId: Id<"canvases"> },
): Promise<Array<CanvasBookmark>> {
  const bookmarks = await ctx.db
    .query("canvasBookmarks")
    .withIndex("by_userId_and_canvasId", (q) =>
      q.eq("userId", userId).eq("canvasId", canvasId),
    )
    .collect();

  // Tri en TS et pas par index : `sortOrder` n'est pas dans la clé, et il n'y a
  // aucune raison de l'y mettre — la liste est bornée par l'usage (les repères
  // d'UN utilisateur sur UN canvas) et se relit en entier à chaque affichage.
  return bookmarks.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function create(
  ctx: MutationCtx,
  {
    userId,
    canvasId,
    label,
    target,
  }: {
    userId: Id<"users">;
    canvasId: Id<"canvases">;
    label?: string;
    target: BookmarkTarget;
  },
): Promise<Id<"canvasBookmarks">> {
  // La liste est déjà triée : le dernier porte le `sortOrder` le plus haut.
  const existing = await listForUserCanvas(ctx, { userId, canvasId });
  const lastSortOrder =
    existing.length > 0 ? existing[existing.length - 1].sortOrder : 0;

  return await ctx.db.insert("canvasBookmarks", {
    userId,
    canvasId,
    ...(label !== undefined ? { label } : {}),
    target: normalizeTarget(target),
    sortOrder: lastSortOrder + SORT_ORDER_STEP,
    updatedAt: Date.now(),
  });
}

/**
 * Renomme un repère. `label: null` efface le nom choisi et rend le repère à son
 * titre vivant — seul un bookmark `node` a de quoi y retomber, c'est à
 * l'appelant de ne pas le proposer ailleurs.
 */
export async function rename(
  ctx: MutationCtx,
  {
    bookmarkId,
    label,
  }: { bookmarkId: Id<"canvasBookmarks">; label: string | null },
): Promise<null> {
  await getBookmarkOrThrow(ctx, bookmarkId);
  await ctx.db.patch("canvasBookmarks", bookmarkId, {
    label: label ?? undefined,
    updatedAt: Date.now(),
  });
  return null;
}

/**
 * Réécrit l'ordre complet de la liste, dans l'ordre reçu.
 *
 * Tout d'un coup et pas un `sortOrder` par appel : un drag déplace un élément
 * mais renumérote tous ses voisins, et le faire en N mutations ferait clignoter
 * la liste sur les états intermédiaires.
 */
export async function reorder(
  ctx: MutationCtx,
  { orderedIds }: { orderedIds: Array<Id<"canvasBookmarks">> },
): Promise<null> {
  const now = Date.now();
  for (const [index, bookmarkId] of orderedIds.entries()) {
    await getBookmarkOrThrow(ctx, bookmarkId);
    await ctx.db.patch("canvasBookmarks", bookmarkId, {
      sortOrder: (index + 1) * SORT_ORDER_STEP,
      updatedAt: now,
    });
  }
  return null;
}

export async function remove(
  ctx: MutationCtx,
  { bookmarkId }: { bookmarkId: Id<"canvasBookmarks"> },
): Promise<null> {
  await getBookmarkOrThrow(ctx, bookmarkId);
  await ctx.db.delete("canvasBookmarks", bookmarkId);
  return null;
}

/**
 * Les repères de TOUS les membres sur un canvas. Appelé par la cascade de
 * suppression de canvas : sans elle, les repères des autres utilisateurs
 * restent avec un `canvasId` dangling.
 */
export async function deleteForCanvas(
  ctx: MutationCtx,
  { canvasId }: { canvasId: Id<"canvases"> },
): Promise<number> {
  const bookmarks = await ctx.db
    .query("canvasBookmarks")
    .withIndex("by_canvasId", (q) => q.eq("canvasId", canvasId))
    .collect();

  for (const bookmark of bookmarks) {
    await ctx.db.delete("canvasBookmarks", bookmark._id);
  }
  return bookmarks.length;
}

/**
 * Un lot des repères d'un utilisateur, toutes canvases confondues — y compris
 * ceux posés sur les canvases d'autrui, que la cascade de suppression de canvas
 * ne voit jamais. Appelé en boucle par la purge de compte, d'où le lot.
 *
 * `by_userId_and_canvasId` interrogé sur son seul préfixe `userId` : un index
 * se requête dans l'ordre de ses champs, et s'arrêter au premier est permis.
 */
export async function deleteForUserBatch(
  ctx: MutationCtx,
  { userId, limit }: { userId: Id<"users">; limit: number },
): Promise<number> {
  const bookmarks = await ctx.db
    .query("canvasBookmarks")
    .withIndex("by_userId_and_canvasId", (q) => q.eq("userId", userId))
    .take(limit);

  for (const bookmark of bookmarks) {
    await ctx.db.delete("canvasBookmarks", bookmark._id);
  }
  return bookmarks.length;
}
