import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  imageModelOptions,
  vImageModelValues,
  MAX_IMAGES_PER_GENERATION,
} from "./agents";
import { requireAuth, requireCanvasAccess } from "../lib/auth";
import { enforceRateLimit } from "../lib/rateLimits";
import errors from "../config/errorsConfig";
import * as NodeDataModels from "../models/nodeDataModels";

/**
 * Au-delà de cette durée, un statut `running` ne peut plus correspondre à une
 * action vivante : Convex borne l'exécution d'une action à 10 minutes. Sans
 * cette sortie de secours, une action tuée en plein vol (déploiement, crash)
 * verrouillerait le node définitivement.
 */
const STALE_GENERATION_MS = 10 * 60 * 1000;

export const listImageModels = query({
  args: {},
  handler: async () => {
    return imageModelOptions;
  },
});

/**
 * Démarre une génération d'images sur un node "image".
 *
 * Rend la main immédiatement : le travail réel part dans une action planifiée,
 * comme pour un message Nolë (cf. ia/nole.ts). C'est ce qui fait qu'une
 * génération déjà payée n'est pas perdue si l'utilisateur ferme le dialog,
 * navigue ailleurs ou recharge la page.
 */
export const generateImages = mutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    prompt: v.string(),
    count: v.number(),
    model: vImageModelValues,
  },
  returns: v.null(),
  handler: async (ctx, { nodeDataId, prompt, count, model }) => {
    const authUserId = await requireAuth(ctx);

    // Chaque appel produit N images facturées à l'unité : c'est une surface qui
    // dépense de l'argent réel, elle ne part pas sans borne.
    await enforceRateLimit(ctx, "imageGeneration", authUserId);

    const nodeData = await ctx.db.get(nodeDataId);
    if (!nodeData) throw new ConvexError(errors.NODE_DATA_NOT_FOUND);
    if (nodeData.type !== "image") {
      throw new ConvexError(errors.IMAGE_GENERATION_WRONG_NODE_TYPE);
    }

    await requireCanvasAccess(ctx, nodeData.canvasId, authUserId, "editor");

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
      throw new ConvexError(errors.IMAGE_GENERATION_EMPTY_PROMPT);
    }

    // Une seule génération à la fois par node : deux runs concurrents
    // écriraient deux statuts qui se marcheraient dessus, et l'échec de l'un
    // effacerait la progression de l'autre.
    const running = nodeData.imageGeneration;
    if (
      running?.status === "running" &&
      Date.now() - running.startedAt < STALE_GENERATION_MS
    ) {
      throw new ConvexError(errors.IMAGE_GENERATION_ALREADY_RUNNING);
    }

    // Borne serveur : le client propose 1..maxImages, mais rien ne l'oblige.
    const safeCount = Math.min(
      Math.max(Math.trunc(count), 1),
      MAX_IMAGES_PER_GENERATION,
    );

    // Le prompt est du contenu utilisateur : il va dans `values`, donc dans
    // l'historique de versions, et devient lisible par l'agent. L'actor est
    // dérivé de l'auth server-side, jamais reçu du client.
    await NodeDataModels.updateValues(ctx, {
      _id: nodeDataId,
      values: { imagePrompt: trimmedPrompt },
      actor: { type: "user", userId: authUserId },
    });

    await NodeDataModels.setImageGeneration(ctx, {
      nodeDataId,
      status: "running",
    });

    void ctx.scheduler.runAfter(
      0,
      internal.ia.imageGenerationRun.runImageGeneration,
      {
        nodeDataId,
        authUserId,
        prompt: trimmedPrompt,
        count: safeCount,
        model,
      },
    );

    return null;
  },
});
