import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import errors from "../config/errorsConfig";
import {
  MAX_BOOKMARK_LABEL_LENGTH,
  MAX_SELECTION_NODE_IDS,
  type BookmarkTarget,
} from "../schemas/canvasBookmarksSchema";

type CanvasBookmark = Doc<"canvasBookmarks">;

/** L'écart entre deux `sortOrder` consécutifs à la création. */
const SORT_ORDER_STEP = 1;

/**
 * Normalise un libellé avant écriture : rogné des espaces, `undefined` quand
 * il est vide (le repère retombe alors sur son libellé par défaut), refusé
 * quand il dépasse le plafond affiché en `truncate` sur une ligne.
 */
function normalizeLabel(label: string | null | undefined): string | undefined {
  if (label === null || label === undefined) return undefined;
  const trimmed = label.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > MAX_BOOKMARK_LABEL_LENGTH) {
    throw new ConvexError(
      `${errors.BOOKMARK_LABEL_TOO_LONG} (${MAX_BOOKMARK_LABEL_LENGTH} characters max).`,
    );
  }
  return trimmed;
}

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

/**
 * Deux cibles visent-elles exactement la même chose ?
 *
 * Sert à rendre `create` idempotent sur ce qui a une identité : un node, ou un
 * groupe de nodes. Un `framing`, lui, n'en a pas — deux repères posés sur la
 * même vue sont deux notes distinctes de l'utilisateur, pas un doublon.
 *
 * Les `selection` sont comparées comme des ENSEMBLES : l'ordre des llmid dans
 * le tableau vient de l'ordre de sélection, qui n'a aucun sens métier.
 */
function isSameTarget(a: BookmarkTarget, b: BookmarkTarget): boolean {
  if (a.kind === "node" && b.kind === "node") return a.nodeId === b.nodeId;
  if (a.kind === "selection" && b.kind === "selection") {
    if (a.nodeIds.length !== b.nodeIds.length) return false;
    const ids = new Set(a.nodeIds);
    return b.nodeIds.every((nodeId) => ids.has(nodeId));
  }
  return false;
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

  // Re-poser un repère sur une cible déjà repérée ne crée rien : on rend
  // celui qui existe. Sans ça, un double-clic sur « Bookmark » (ou deux
  // appels concurrents depuis deux onglets) empilait deux lignes identiques
  // dans le panneau, impossibles à distinguer l'une de l'autre.
  const normalizedTarget = normalizeTarget(target);
  const duplicate = existing.find((bookmark) =>
    isSameTarget(bookmark.target, normalizedTarget),
  );
  if (duplicate) return duplicate._id;

  const lastSortOrder =
    existing.length > 0 ? existing[existing.length - 1].sortOrder : 0;
  const normalizedLabel = normalizeLabel(label);

  return await ctx.db.insert("canvasBookmarks", {
    userId,
    canvasId,
    ...(normalizedLabel !== undefined ? { label: normalizedLabel } : {}),
    target: normalizedTarget,
    sortOrder: lastSortOrder + SORT_ORDER_STEP,
    updatedAt: Date.now(),
  });
}

/**
 * Renomme un repère. `label: null` (ou une chaîne vide) efface le nom choisi
 * et rend le repère à son titre vivant — seul un bookmark `node` a de quoi y
 * retomber, c'est à l'appelant de ne pas le proposer ailleurs.
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
    label: normalizeLabel(label),
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
 * Retire les nodes visés d'une liste de repères, et rend le nombre de repères
 * touchés :
 *
 * - un repère `node` visé part en entier ;
 * - un repère `selection` est rogné des nodes visés, et ne part que s'il n'en
 *   reste aucun — sinon on détruirait le repère des nodes voisins.
 *
 * Les `framing` ne visent aucun node : ils ne bougent pas.
 */
async function pruneNodesFromBookmarks(
  ctx: MutationCtx,
  bookmarks: Array<CanvasBookmark>,
  targeted: Set<string>,
): Promise<number> {
  const now = Date.now();
  let touched = 0;

  for (const bookmark of bookmarks) {
    const { target } = bookmark;

    if (target.kind === "node") {
      if (!targeted.has(target.nodeId)) continue;
      await ctx.db.delete("canvasBookmarks", bookmark._id);
      touched += 1;
      continue;
    }

    if (target.kind !== "selection") continue;

    const remaining = target.nodeIds.filter((nodeId) => !targeted.has(nodeId));
    if (remaining.length === target.nodeIds.length) continue;

    if (remaining.length === 0) {
      await ctx.db.delete("canvasBookmarks", bookmark._id);
    } else {
      await ctx.db.patch("canvasBookmarks", bookmark._id, {
        target: { kind: "selection", nodeIds: remaining },
        updatedAt: now,
      });
    }
    touched += 1;
  }

  return touched;
}

/**
 * Dé-repère des nodes : retire toute trace d'eux dans les repères de
 * l'utilisateur sur ce canvas.
 *
 * L'unité n'est pas le repère mais le NODE — c'est la sémantique « gras »
 * demandée côté menus : un node est repéré ou il ne l'est pas, peu importe
 * lequel de ses repères le porte, exactement comme un caractère est en gras
 * sans qu'on ait à savoir quel span le met en gras. D'où le rognage des
 * `selection` plutôt que leur suppression (cf. `pruneNodesFromBookmarks`).
 */
export async function removeForNodes(
  ctx: MutationCtx,
  {
    userId,
    canvasId,
    nodeIds,
  }: {
    userId: Id<"users">;
    canvasId: Id<"canvases">;
    nodeIds: Array<string>;
  },
): Promise<number> {
  const targeted = new Set(nodeIds);
  if (targeted.size === 0) return 0;

  const bookmarks = await listForUserCanvas(ctx, { userId, canvasId });
  return pruneNodesFromBookmarks(ctx, bookmarks, targeted);
}

/**
 * Nettoie les repères de TOUS les membres d'un canvas qui visaient des nodes
 * définitivement détruits. Appelé par la purge de la corbeille
 * (`NodeModels.purgeTrashedBatch`).
 *
 * Tant qu'un node dort à la corbeille, ses repères restent : affichés grisés,
 * ils reprennent vie si on le restaure. Une fois le node purgé, ils ne
 * mèneraient plus jamais nulle part — un repère `node` part, une `selection`
 * perd ces ids et part si elle n'en garde aucun.
 *
 * `collect` sur le canvas, comme `deleteForCanvas` : le volume est borné par
 * ce que ses membres ont repéré à la main, pas par la taille du canvas.
 */
export async function removeForPurgedNodes(
  ctx: MutationCtx,
  { canvasId, nodeIds }: { canvasId: Id<"canvases">; nodeIds: Array<string> },
): Promise<number> {
  const targeted = new Set(nodeIds);
  if (targeted.size === 0) return 0;

  const bookmarks = await ctx.db
    .query("canvasBookmarks")
    .withIndex("by_canvasId", (q) => q.eq("canvasId", canvasId))
    .collect();
  return pruneNodesFromBookmarks(ctx, bookmarks, targeted);
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
