import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import errors from "../config/errorsConfig";
import { internal } from "../_generated/api";
import type { NodeDataVersionActor } from "../schemas/nodeDataVersionsSchema";
import * as CanvasBookmarkModels from "./canvasBookmarkModels";
import {
  MAX_CANVAS_ICON_LENGTH,
  type CanvasColor,
} from "../schemas/canvasesSchema";

type CanvasCoverImage = NonNullable<Doc<"canvases">["coverImage"]>;

/**
 * Ce qu'une écriture change à l'identité visuelle d'un canvas. Par champ :
 * `undefined` n'y touche pas, `null` l'efface, une valeur la remplace.
 */
export type CanvasAppearancePatch = {
  icon?: string | null;
  color?: CanvasColor | null;
  coverImage?: CanvasCoverImage | null;
};

type UserCanvasListItem = {
  _id: Id<"canvases">;
  name: string;
  description?: string;
  icon?: string;
  color?: CanvasColor;
  coverImage?: CanvasCoverImage;
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
  const canvas = await ctx.db.get("canvases", canvasId);
  if (!canvas) throw new ConvexError(errors.CANVAS_NOT_FOUND);
  return canvas;
}

/** Les champs d'identité présents sur le doc, sans clé `undefined` en trop. */
function appearanceOf(
  canvas: Doc<"canvases">,
): Pick<UserCanvasListItem, "icon" | "color" | "coverImage"> {
  return {
    ...(canvas.icon !== undefined ? { icon: canvas.icon } : {}),
    ...(canvas.color !== undefined ? { color: canvas.color } : {}),
    ...(canvas.coverImage !== undefined
      ? { coverImage: canvas.coverImage }
      : {}),
  };
}

/**
 * Une couverture n'est acceptée que si elle pointe sur un objet uploadé par le
 * propriétaire du canvas (les clés R2 sont préfixées par l'id de l'uploadeur,
 * cf. `uploads.buildUpload`) et servi depuis notre bucket. Sans ça, n'importe
 * quelle URL s'afficherait sur la home, et la libération de la couverture
 * (`releaseCoverKeys`) pourrait viser l'objet de quelqu'un d'autre.
 */
function assertValidCoverImage(
  coverImage: CanvasCoverImage,
  ownerId: Id<"users">,
): void {
  const { url, key } = coverImage;
  const publicBase = process.env.R2_PUBLIC_URL;
  const urlMatchesKey = publicBase
    ? url === `${publicBase}/${key}`
    : url.startsWith("https://") && url.endsWith(`/${key}`);
  if (!key.startsWith(`${ownerId}/`) || key.includes("..") || !urlMatchesKey) {
    throw new ConvexError(errors.CANVAS_COVER_IMAGE_INVALID);
  }
}

/** Icône nettoyée : `undefined` si vide, erreur si trop longue. */
function normalizeIcon(icon: string): string | undefined {
  const trimmed = icon.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > MAX_CANVAS_ICON_LENGTH) {
    throw new ConvexError(errors.CANVAS_ICON_TOO_LONG);
  }
  return trimmed;
}

/**
 * Traduit un `CanvasAppearancePatch` en champs à poser sur le doc, et dit
 * quelle clé de couverture l'écriture laisse derrière elle.
 */
function resolveAppearancePatch(
  canvas: Doc<"canvases">,
  appearance: CanvasAppearancePatch,
): {
  fields: Partial<Pick<Doc<"canvases">, "icon" | "color" | "coverImage">>;
  releasedCoverKey: string | null;
} {
  const fields: Partial<
    Pick<Doc<"canvases">, "icon" | "color" | "coverImage">
  > = {};
  let releasedCoverKey: string | null = null;

  if (appearance.icon !== undefined) {
    fields.icon =
      appearance.icon === null ? undefined : normalizeIcon(appearance.icon);
  }
  if (appearance.color !== undefined) {
    fields.color = appearance.color ?? undefined;
  }
  if (appearance.coverImage !== undefined) {
    if (appearance.coverImage !== null) {
      assertValidCoverImage(appearance.coverImage, canvas.creatorId);
    }
    fields.coverImage = appearance.coverImage ?? undefined;
    const previousKey = canvas.coverImage?.key;
    if (previousKey && previousKey !== appearance.coverImage?.key) {
      releasedCoverKey = previousKey;
    }
  }

  return { fields, releasedCoverKey };
}

/**
 * Supprime de R2 les couvertures qu'un canvas vient de lâcher.
 *
 * Une clé encore référencée par un node (table `r2Objects`) est épargnée : la
 * couverture est normalement un upload à elle, mais rien n'empêche un appel
 * d'API de réutiliser la clé d'une image du canvas, et c'est le node qui
 * perdrait son fichier.
 */
async function releaseCoverKeys(
  ctx: MutationCtx,
  keys: Array<string>,
): Promise<void> {
  const orphaned: Array<string> = [];
  for (const key of keys) {
    const stillUsed = await ctx.db
      .query("r2Objects")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (!stillUsed) orphaned.push(key);
  }
  if (orphaned.length > 0) {
    await ctx.scheduler.runAfter(0, internal.uploads.deleteR2Files, {
      keys: orphaned,
    });
  }
}

async function countLiveNodes(
  ctx: QueryCtx | MutationCtx,
  canvasId: Id<"canvases">,
): Promise<number> {
  const nodes = await ctx.db
    .query("nodes")
    .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
    .collect();
  return nodes.filter((node) => node.status !== "trashed").length;
}

export async function touchCanvas(
  ctx: MutationCtx,
  canvasId: Id<"canvases">,
): Promise<void> {
  await ctx.db.patch("canvases", canvasId, { updatedAt: Date.now() });
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
          ...appearanceOf(canvas),
          shared: true as const,
          permission: share.permission,
          updatedAt: canvas.updatedAt,
          nodeCount: await countLiveNodes(ctx, canvas._id),
        };
      }),
  );

  return [
    // Les deux listes sont triées par récence, mais séparément : l'appelant
    // qui les affiche l'une sous l'autre (sidebar, home) n'a rien à retrier,
    // et celui qui les sépare garde chaque section dans le bon ordre.
    ...(await Promise.all(
      ownCanvases.map(async (canvas) => ({
        _id: canvas._id,
        name: canvas.name,
        description: canvas.description,
        ...appearanceOf(canvas),
        updatedAt: canvas.updatedAt,
        nodeCount: await countLiveNodes(ctx, canvas._id),
      })),
    )),
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
    background,
    icon,
    color,
    coverImage,
  }: {
    authUserId: Id<"users">;
    name: string;
    description?: string;
    background?: NonNullable<Doc<"canvases">["background"]>;
    icon?: string;
    color?: CanvasColor;
    coverImage?: CanvasCoverImage;
  },
): Promise<Id<"canvases">> {
  if (coverImage !== undefined) assertValidCoverImage(coverImage, authUserId);
  const normalizedIcon = icon !== undefined ? normalizeIcon(icon) : undefined;

  return await ctx.db.insert("canvases", {
    creatorId: authUserId,
    name,
    description,
    ...(background !== undefined ? { background } : {}),
    ...(normalizedIcon !== undefined ? { icon: normalizedIcon } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(coverImage !== undefined ? { coverImage } : {}),
    updatedAt: Date.now(),
  });
}

export async function updateCanvasDetails(
  ctx: MutationCtx,
  {
    canvasId,
    name,
    description,
    background,
    appearance = {},
  }: {
    canvasId: Id<"canvases">;
    name: string;
    description?: string;
    // `undefined` = champ untouched : on ne touche pas au background stocké.
    background?: NonNullable<Doc<"canvases">["background"]>;
    appearance?: CanvasAppearancePatch;
  },
): Promise<Id<"canvases">> {
  const canvas = await getCanvasOrThrow(ctx, canvasId);
  const { fields, releasedCoverKey } = resolveAppearancePatch(
    canvas,
    appearance,
  );

  await ctx.db.patch("canvases", canvasId, {
    name,
    description,
    ...(background !== undefined ? { background } : {}),
    ...fields,
    updatedAt: Date.now(),
  });
  if (releasedCoverKey) await releaseCoverKeys(ctx, [releasedCoverKey]);

  return canvasId;
}

export async function setCanvasAppearance(
  ctx: MutationCtx,
  {
    canvasId,
    appearance,
  }: {
    canvasId: Id<"canvases">;
    appearance: CanvasAppearancePatch;
  },
): Promise<Id<"canvases">> {
  const canvas = await getCanvasOrThrow(ctx, canvasId);
  const { fields, releasedCoverKey } = resolveAppearancePatch(
    canvas,
    appearance,
  );

  await ctx.db.patch("canvases", canvasId, {
    ...fields,
    updatedAt: Date.now(),
  });
  if (releasedCoverKey) await releaseCoverKeys(ctx, [releasedCoverKey]);

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
    purgeVersions = false,
  }: {
    canvasId: Id<"canvases">;
    // Attribution des snapshots de suppression (versioning) ; system par défaut.
    actor?: NodeDataVersionActor;
    // Cf. `deleteNodeDataWithCascade` : détruit l'historique des nodes au lieu
    // de le laisser vivre sa rétention. Réservé à la suppression de compte.
    purgeVersions?: boolean;
  },
): Promise<Id<"canvases">> {
  const canvas = await getCanvasOrThrow(ctx, canvasId);

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
      { nodeDataId: nodeData._id, actor, purgeVersions },
    );
  }
  if (nodeDatas.length > 0) {
    console.log(
      `🗑️ Scheduled cascade deletion for ${nodeDatas.length} nodeDatas on canvas ${canvasId}`,
    );
  }

  // Les rows layout (`nodes`) et les edges vivent en tables, pas dans le doc
  // canvas : sans purge, chaque canvas supprimé les laisse derrière avec un
  // canvasId dangling — stockage facturé pour rien. Hard-delete direct :
  // la cascade nodeData est déjà schedulée ci-dessus, et un canvas entier
  // n'a pas d'undo.
  const nodes = await ctx.db
    .query("nodes")
    .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
    .collect();
  for (const node of nodes) {
    await ctx.db.delete(node._id);
  }

  const edges = await ctx.db
    .query("edges")
    .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
    .collect();
  for (const edge of edges) {
    await ctx.db.delete(edge._id);
  }

  // Les repères de navigation de TOUS les membres, pas seulement du
  // propriétaire : un canvas partagé porte les bookmarks de chacun, et eux
  // n'ont aucun autre chemin de suppression — la purge de compte ne ramasse
  // que ceux de l'utilisateur qu'elle efface.
  await CanvasBookmarkModels.deleteForCanvas(ctx, { canvasId });

  // La couverture n'est pas un fichier de node : la cascade nodeData ne la
  // voit pas, elle part ici.
  if (canvas.coverImage) await releaseCoverKeys(ctx, [canvas.coverImage.key]);

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
