"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { requestOpenRouterImages, vImageModelValues } from "./agents";
import { uploadBuffer } from "../lib/r2";
import { aiUsageSources } from "../schemas/aiUsageSourceSchema";
import type { StoredImage } from "../models/nodeDataModels";

/**
 * Devine le type MIME à partir des octets de tête. OpenRouter ne le déclare
 * nulle part dans sa réponse, et les modèles ne renvoient pas tous du PNG :
 * stocker un `Content-Type` faux sur R2 casserait l'affichage et le
 * téléchargement, sans erreur visible.
 */
function sniffImageMimeType(bytes: Uint8Array): string {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);

  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  // RIFF....WEBP
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/png";
}

function extensionFor(mimeType: string): string {
  return mimeType.split("/")[1] ?? "png";
}

/**
 * Génère les images, les recopie sur NOTRE R2, puis les appende au node.
 *
 * L'upload R2 n'est pas une optimisation : les URLs renvoyées par les
 * fournisseurs d'images sont éphémères, et un node qui les stockerait
 * afficherait des images mortes quelques heures plus tard.
 *
 * Toute la fonction est sous `try/catch` : une erreur ici est le seul moyen
 * qu'a l'utilisateur d'apprendre que sa génération a échoué, puisque la
 * mutation lui a déjà rendu la main.
 */
export const runImageGeneration = internalAction({
  args: {
    nodeDataId: v.id("nodeDatas"),
    authUserId: v.id("users"),
    prompt: v.string(),
    count: v.number(),
    model: vImageModelValues,
  },
  returns: v.null(),
  handler: async (ctx, { nodeDataId, authUserId, prompt, count, model }) => {
    try {
      const result = await requestOpenRouterImages({ model, prompt, n: count });

      const generatedAt = Date.now();
      const images: StoredImage[] = [];

      for (const base64 of result.images) {
        const buffer = Buffer.from(base64, "base64");
        const bytes = new Uint8Array(
          buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
          ),
        );
        const mimeType = sniffImageMimeType(bytes);
        // Même convention de clé que les uploads utilisateur (cf. uploads.ts) :
        // préfixée par l'userId, corps aléatoire, nom de fichier lisible.
        const key = `${authUserId}/${crypto.randomUUID()}_generated.${extensionFor(mimeType)}`;

        const url = await uploadBuffer(key, bytes.buffer, mimeType);

        images.push({
          url,
          filename: `generated-${images.length + 1}.${extensionFor(mimeType)}`,
          mimeType,
          size: bytes.byteLength,
          uploadedAt: generatedAt,
          key,
        });
      }

      // `actor: user` et pas `system` : la génération est déclenchée par
      // l'utilisateur, et c'est ce qui fait coalescer ce write avec celui du
      // prompt quelques secondes plus tôt — un seul point de restauration pour
      // toute la génération, au lieu de deux dont un état intermédiaire.
      await ctx.runMutation(internal.wrappers.nodeDataWrappers.appendImages, {
        nodeDataId,
        images,
        actor: { type: "user", userId: authUserId },
      });

      // Comptabilité après coup, comme le usageHandler des agents : jamais
      // bloquante, mais son absence rendrait la dépense invisible.
      await ctx.runMutation(internal.wrappers.aiUsageWrappers.recordUsage, {
        source: aiUsageSources.imageGeneration,
        userId: authUserId,
        model,
        provider: "openrouter",
        costUsd: result.costUsd,
        tokens: {
          inputTokens: result.tokens.inputTokens,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: result.tokens.outputTokens,
          reasoningTokens: 0,
          totalTokens: result.tokens.totalTokens,
        },
      });

      if (result.costUsd === undefined) {
        // Bruyant mais non bloquant : si cette ligne apparaît, l'usage
        // accounting d'OpenRouter n'a pas été appliqué sur /images et la
        // dépense en images n'est plus suivie.
        console.error("[aiUsage] image generation returned no cost", {
          model,
          nodeDataId,
        });
      }
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Image generation failed.";
      console.error("[imageGeneration] run failed", { nodeDataId, detail });

      await ctx.runMutation(
        internal.wrappers.nodeDataWrappers.setImageGeneration,
        { nodeDataId, status: "error", error: detail },
      );
    }

    return null;
  },
});
