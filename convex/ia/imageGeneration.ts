import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  imageModelOptions,
  vImageModelValues,
  getImageModelOption,
  MAX_IMAGES_PER_GENERATION,
  type ImageModelValues,
} from "./agents";
import { requireAuth, requireCanvasAccess } from "../lib/auth";
import { enforceRateLimit } from "../lib/rateLimits";
import errors from "../config/errorsConfig";
import * as NodeDataModels from "../models/nodeDataModels";
import { readLegacyNodeData } from "../lib/legacyNodeDataReaders";

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
 * Les URLs des images à joindre à la génération, une fois prouvé qu'on a le
 * droit de les joindre.
 *
 * La règle produit — seuls les nodes image BRANCHÉS EN ENTRÉE du node qui
 * génère sont référençables — vit ici et pas dans l'UI. `generateImages` est
 * une mutation publique : la liste de vignettes affichée par le client est une
 * commodité, pas une barrière. Un `referenceNodeIds` fabriqué à la main doit se
 * heurter au même mur.
 *
 * Tout écart lève plutôt que de filtrer en silence. Une référence qu'on
 * laisserait tomber sans le dire produirait une image payée qui ne ressemble
 * pas à ce que l'utilisateur a demandé, sans rien pour l'expliquer.
 *
 * Rend AUSSI la liste de nodes réellement retenue, et c'est elle qu'on
 * persiste : sans ça un doublon resterait dans `values.imageReferences` alors
 * qu'il n'a été joint qu'une fois, et l'état enregistré décrirait une requête
 * qui n'a jamais eu lieu.
 */
async function resolveReferenceImageUrls(
  ctx: MutationCtx,
  {
    nodeData,
    nodeDataId,
    referenceNodeIds,
    model,
  }: {
    nodeData: Doc<"nodeDatas">;
    nodeDataId: Id<"nodeDatas">;
    referenceNodeIds: string[];
    model: ImageModelValues;
  },
): Promise<{ urls: string[]; nodeIds: string[] }> {
  if (referenceNodeIds.length === 0) return { urls: [], nodeIds: [] };

  // Avant toute lecture : un modèle qui n'accepte pas de référence rend la
  // question sans objet.
  //
  // Annoté `number` et non inféré : `imageModelOptions` est `as const`, donc le
  // champ se réduit à l'union des valeurs présentes aujourd'hui et TypeScript
  // déclarerait le test ci-dessous impossible. `0` fait partie du contrat du
  // champ, pas du catalogue actuel — c'est le catalogue qui changera.
  const maxReferences: number = getImageModelOption(model).maxReferenceImages;
  if (maxReferences === 0) {
    throw new ConvexError(errors.IMAGE_GENERATION_MODEL_NO_REFERENCES);
  }

  const canvas = await ctx.db.get("canvases", nodeData.canvasId);
  if (!canvas) throw new ConvexError(errors.CANVAS_NOT_FOUND);

  // Edges identify placements, not content. Never pick an ambiguous placement.
  const selfNodes = (canvas.nodes ?? []).filter(
    (node) =>
      node.nodeDataId === nodeDataId || node.data?.nodeDataId === nodeDataId,
  );
  if (selfNodes.length > 1) {
    throw new ConvexError("Ambiguous placement for nodeData.");
  }
  const selfNode = selfNodes[0];
  if (!selfNode) throw new ConvexError(errors.NODE_NOT_FOUND);
  if (
    (canvas.nodes ?? []).some(
      (node) => node !== selfNode && node.id === selfNode.id,
    )
  ) {
    throw new ConvexError(`Ambiguous placement for node ${selfNode.id}.`);
  }
  await readLegacyNodeData(ctx, canvas._id, selfNode);

  const inputNodeIds = new Set(
    (canvas.edges ?? [])
      .filter((edge) => edge.target === selfNode.id)
      .map((edge) => edge.source),
  );

  const urls: string[] = [];
  const seen = new Set<string>();

  for (const nodeId of referenceNodeIds) {
    // Deux fois le même node ne joint pas ses images deux fois : ce serait
    // payer le même contexte en double et brouiller l'ordre que l'utilisateur
    // a sous les yeux.
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);

    if (!inputNodeIds.has(nodeId)) {
      throw new ConvexError(errors.IMAGE_GENERATION_REFERENCE_NOT_INPUT);
    }

    const sourceNodes = (canvas.nodes ?? []).filter((node) => node.id === nodeId);
    if (sourceNodes.length > 1) {
      throw new ConvexError(`Ambiguous placement for node ${nodeId}.`);
    }
    const sourceNode = sourceNodes[0];
    const sourceData = sourceNode
      ? await readLegacyNodeData(ctx, canvas._id, sourceNode)
      : null;
    if (!sourceData || sourceData.type !== "image") {
      throw new ConvexError(errors.IMAGE_GENERATION_REFERENCE_NOT_IMAGE);
    }

    // Un node image porte N images et les joint TOUTES : c'est ce que
    // l'utilisateur voit sur le node, donc ce qu'il croit joindre.
    const images = Array.isArray(sourceData.values?.images)
      ? (sourceData.values.images as Array<{ url?: unknown }>)
      : [];
    const nodeUrls = images
      .map((image) => image?.url)
      .filter(
        (url): url is string => typeof url === "string" && url.length > 0,
      );
    if (nodeUrls.length === 0) {
      throw new ConvexError(errors.IMAGE_GENERATION_REFERENCE_NOT_IMAGE);
    }

    urls.push(...nodeUrls);
  }

  // Compté en IMAGES et non en nodes : un seul node multi-image peut à lui
  // seul dépasser le plafond du modèle.
  if (urls.length > maxReferences) {
    throw new ConvexError(errors.IMAGE_GENERATION_TOO_MANY_REFERENCES);
  }

  return { urls, nodeIds: [...seen] };
}

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
    // Ids de node CANVAS (React Flow), pas des `nodeDatas` : c'est ce que les
    // edges désignent, et donc la seule forme sur laquelle « branché en
    // entrée » se vérifie.
    referenceNodeIds: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { nodeDataId, prompt, count, model, referenceNodeIds = [] },
  ) => {
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

    // AVANT le premier write : une référence refusée doit laisser le node
    // exactement dans l'état où l'utilisateur l'a trouvé, pas avec un prompt
    // à moitié enregistré et aucune image.
    const references = await resolveReferenceImageUrls(ctx, {
      nodeData,
      nodeDataId,
      referenceNodeIds,
      model,
    });

    // Le prompt est du contenu utilisateur : il va dans `values`, donc dans
    // l'historique de versions, et devient lisible par l'agent. L'actor est
    // dérivé de l'auth server-side, jamais reçu du client.
    //
    // `imageReferences` part dans le même write que le prompt : les deux
    // forment une intention unique, et un restore de version doit rendre le
    // couple, pas un prompt qui décrit des images qui ne sont plus jointes.
    await NodeDataModels.updateValues(ctx, {
      _id: nodeDataId,
      values: {
        imagePrompt: trimmedPrompt,
        imageReferences: references.nodeIds,
      },
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
        referenceUrls: references.urls,
      },
    );

    return null;
  },
});
