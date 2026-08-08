import { v, ConvexError } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { generatePresignedUrl, getPublicUrl, deleteObject } from "./lib/r2";
import { requireAuth } from "./lib/auth";
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
