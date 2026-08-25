import { v, ConvexError } from "convex/values";
import { action, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  generatePresignedUrl,
  generatePresignedDownloadUrl,
  getPublicUrl,
  deleteObject,
} from "./lib/r2";
import { getCanvasAccess, requireAuth } from "./lib/auth";
import { enforceRateLimit } from "./lib/rateLimits";
import errors from "./config/errorsConfig";
import {
  MAX_UPLOAD_FILES_PER_REQUEST,
  normalizeMimeType,
  resolveUploadPolicy,
} from "./config/uploadsConfig";

const uploadTargetValidator = v.object({
  filename: v.string(),
  mimeType: v.string(),
  // Taille réelle du fichier : elle est signée dans l'URL présignée, donc R2
  // refuse un PUT dont le corps ne fait pas exactement cette taille.
  size: v.number(),
});

const uploadUrlValidator = v.object({
  uploadUrl: v.string(),
  publicUrl: v.string(),
  key: v.string(),
  // À poser tels quels sur le PUT : ils font partie de la signature.
  headers: v.record(v.string(), v.string()),
});

type UploadTarget = { filename: string; mimeType: string; size: number };

async function buildUpload(userId: string, file: UploadTarget) {
  const policy = resolveUploadPolicy(file.mimeType);
  if (!policy) {
    throw new ConvexError(errors.UNSUPPORTED_FILE_TYPE);
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new ConvexError(errors.INVALID_FILE_SIZE);
  }
  if (file.size > policy.maxBytes) {
    throw new ConvexError(errors.FILE_TOO_LARGE);
  }

  const mimeType = normalizeMimeType(file.mimeType);
  const uniqueId = crypto.randomUUID();
  const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${userId}/${uniqueId}_${sanitizedFilename}`;

  const { url, headers } = await generatePresignedUrl(key, {
    mimeType,
    size: file.size,
    disposition: policy.disposition,
  });

  return {
    uploadUrl: url, // Pour le PUT du client
    publicUrl: getPublicUrl(key), // À sauvegarder dans le node après upload
    key, // Pour référence/delete futur
    headers,
  };
}

// Single file upload - Action publique
export const generateUploadUrl = action({
  args: uploadTargetValidator.fields,
  returns: uploadUrlValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await enforceRateLimit(ctx, "uploadUrl", userId);
    return buildUpload(userId, args);
  },
});

/**
 * Ce compte a-t-il le droit de télécharger cet objet ?
 *
 * La clé seule ne prouve rien : elle est préfixée par l'id de l'uploadeur,
 * mais un fichier posé par le propriétaire d'un canvas partagé doit rester
 * téléchargeable par ses viewers. On remonte donc la référence
 * (`r2Objects.by_key`) jusqu'au canvas et on applique l'accès canvas normal.
 *
 * Une clé sans référence répond `false` : soit elle n'existe pas, soit elle
 * date d'avant la table de refcount, et dans les deux cas on n'a rien pour
 * décider.
 */
export const canUserDownloadKey = internalQuery({
  args: { key: v.string(), userId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, { key, userId }) => {
    const refs = await ctx.db
      .query("r2Objects")
      .withIndex("by_key", (q) => q.eq("key", key))
      .collect();

    // Un objet dupliqué est référencé par plusieurs nodeDatas, éventuellement
    // sur des canvases différents : l'accès à un seul d'entre eux suffit.
    for (const ref of refs) {
      const nodeData = await ctx.db.get(ref.nodeDataId);
      if (!nodeData) continue;
      const access = await getCanvasAccess(ctx, nodeData.canvasId, userId);
      if (access) return true;
    }

    return false;
  },
});

/**
 * URL de téléchargement d'un objet stocké, valable 15 minutes.
 *
 * Le `filename` ne sert qu'à nommer le fichier chez l'utilisateur : c'est la
 * `key` qui désigne l'objet, et elle est vérifiée avant signature.
 */
export const generateDownloadUrl = action({
  args: { key: v.string(), filename: v.string() },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, { key, filename }) => {
    const userId = await requireAuth(ctx);
    await enforceRateLimit(ctx, "uploadUrl", userId);

    const allowed = await ctx.runQuery(internal.uploads.canUserDownloadKey, {
      key,
      userId,
    });
    if (!allowed) {
      throw new ConvexError(errors.UNAUTHORIZED_USER);
    }

    return { url: await generatePresignedDownloadUrl(key, filename) };
  },
});

export const deleteR2Files = internalAction({
  args: { keys: v.array(v.string()) },
  returns: v.null(),
  handler: async (_ctx, { keys }) => {
    await Promise.allSettled(
      keys.map((key) =>
        deleteObject(key).catch((err) =>
          console.error(`[deleteR2Files] Failed to delete key "${key}":`, err),
        ),
      ),
    );
    return null;
  },
});

// Multiple files upload - Action publique
export const generateUploadUrls = action({
  args: {
    files: v.array(uploadTargetValidator),
  },
  returns: v.array(uploadUrlValidator),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    if (args.files.length === 0) return [];
    if (args.files.length > MAX_UPLOAD_FILES_PER_REQUEST) {
      throw new ConvexError(errors.TOO_MANY_FILES);
    }

    await enforceRateLimit(ctx, "uploadUrl", userId);

    return Promise.all(args.files.map((file) => buildUpload(userId, file)));
  },
});
