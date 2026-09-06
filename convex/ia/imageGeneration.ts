import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  imageModelOptions,
  vImageModelValues,
  MAX_IMAGES_PER_GENERATION,
  type ImageModelValues,
} from "./agents";
import { requireAuth, requireCanvasAccess } from "../lib/auth";
import { enforceRateLimit } from "../lib/rateLimits";
import errors from "../config/errorsConfig";
import { readStoredImages } from "../lib/storedImages";
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
 * Les URLs des images à joindre à la génération, une fois prouvé qu'on a le
 * droit de les joindre.
 *
 * La règle produit — seuls les nodes image BRANCHÉS EN ENTRÉE du node qui
 * génère sont référençables — vit ici et pas dans l'UI. `generateImages` est
 * une mutation publique : la liste de vignettes affichée par le client est une
 * commodité, pas une barrière. Un `referenceNodeDataIds` fabriqué à la main
 * doit se heurter au même mur.
 *
 * Tout écart lève plutôt que de filtrer en silence. Une référence qu'on
 * laisserait tomber sans le dire produirait une image payée qui ne ressemble
 * pas à ce que l'utilisateur a demandé, sans rien pour l'expliquer.
 *
 * Reçoit le `canvas` plutôt que d'aller le chercher : l'appelant l'a déjà en
 * main via `requireCanvasAccess`, et c'est le plus gros document de l'app —
 * le relire gonflerait le read-set de la mutation, donc sa surface de conflit
 * OCC avec chaque déplacement de node concurrent.
 */
async function resolveReferenceImageUrls(
  ctx: MutationCtx,
  {
    canvas,
    nodeDataId,
    referenceNodeDataIds,
    model,
  }: {
    canvas: Doc<"canvases">;
    nodeDataId: Id<"nodeDatas">;
    /** Déjà dédupliqués par l'appelant, dans l'ordre de sélection. */
    referenceNodeDataIds: Id<"nodeDatas">[];
    model: ImageModelValues;
  },
): Promise<string[]> {
  if (referenceNodeDataIds.length === 0) return [];

  // Avant toute lecture : un modèle qui n'accepte pas de référence rend la
  // question sans objet. Un slug absent du catalogue retombe sur `0`, donc sur
  // ce même refus — plutôt qu'un cast qui nierait le cas.
  const maxReferences: number =
    imageModelOptions.find((option) => option.value === model)
      ?.maxReferenceImages ?? 0;
  if (maxReferences === 0) {
    throw new ConvexError(errors.IMAGE_GENERATION_MODEL_NO_REFERENCES);
  }

  // Une seule passe sur `canvas.nodes`, qui ramasse à la fois le node courant
  // et la correspondance `nodeDataId → id de node canvas` pour les seules
  // références demandées. Les edges parlent en ids canvas, les références sont
  // stockées en `nodeDataId` : c'est ici que les deux se rejoignent.
  const wanted = new Set<string>(referenceNodeDataIds);
  const canvasIdByNodeDataId = new Map<string, string>();
  let selfNodeId: string | undefined;

  for (const node of canvas.nodes ?? []) {
    if (!node.nodeDataId) continue;
    if (node.nodeDataId === nodeDataId) selfNodeId = node.id;
    if (wanted.has(node.nodeDataId)) {
      canvasIdByNodeDataId.set(node.nodeDataId, node.id);
    }
  }
  if (!selfNodeId) throw new ConvexError(errors.NODE_NOT_FOUND);

  const inputNodeIds = new Set(
    (canvas.edges ?? [])
      .filter((edge) => edge.target === selfNodeId)
      .map((edge) => edge.source),
  );

  // Le contrôle d'appartenance ne fait aucune I/O : le passer AVANT les
  // lectures permet de les lancer toutes ensemble, au lieu d'enchaîner un
  // aller-retour par référence dans une mutation que l'utilisateur attend.
  for (const nodeDataIdRef of referenceNodeDataIds) {
    const canvasNodeId = canvasIdByNodeDataId.get(nodeDataIdRef);
    if (!canvasNodeId || !inputNodeIds.has(canvasNodeId)) {
      throw new ConvexError(errors.IMAGE_GENERATION_REFERENCE_NOT_INPUT);
    }
  }

  const sources = await Promise.all(
    referenceNodeDataIds.map((id) => ctx.db.get("nodeDatas", id)),
  );

  const urls: string[] = [];
  for (const source of sources) {
    if (!source || source.type !== "image") {
      throw new ConvexError(errors.IMAGE_GENERATION_REFERENCE_NOT_IMAGE);
    }
    // Un node image porte N images et les joint TOUTES : c'est ce que
    // l'utilisateur voit sur le node, donc ce qu'il croit joindre.
    const images = readStoredImages(source.values);
    if (images.length === 0) {
      throw new ConvexError(errors.IMAGE_GENERATION_REFERENCE_NOT_IMAGE);
    }
    urls.push(...images.map((image) => image.url));
  }

  // Compté en IMAGES et non en nodes : un seul node multi-image peut à lui
  // seul dépasser le plafond du modèle.
  if (urls.length > maxReferences) {
    throw new ConvexError(errors.IMAGE_GENERATION_TOO_MANY_REFERENCES);
  }

  return urls;
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
    // Des `nodeDatas`, pas des ids de node canvas : un id canvas n'a de sens que
    // dans SON canvas, alors qu'un `nodeDataId` est global. C'est la convention
    // que suivent déjà les pills de mention BlockNote, et ce qui rend la valeur
    // stockée lisible hors de son canvas d'origine. La correspondance vers les
    // ids canvas — la seule forme sur laquelle « branché en entrée » se
    // vérifie — se fait dans le contrôle.
    referenceNodeDataIds: v.optional(v.array(v.id("nodeDatas"))),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { nodeDataId, prompt, count, model, referenceNodeDataIds = [] },
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

    // Le retour porte le canvas, déjà lu pour vérifier l'accès : le jeter
    // obligerait le contrôle des références à le relire (cf. dataExport.ts).
    const { canvas } = await requireCanvasAccess(
      ctx,
      nodeData.canvasId,
      authUserId,
      "editor",
    );

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

    // Dédupliqué ici, pas dans le contrôle : c'est l'appelant qui a besoin de la
    // liste retenue pour l'écrire. Deux fois le même node joindrait ses images
    // en double — même contexte payé deux fois, et l'ordre affiché brouillé.
    const uniqueReferenceIds = [...new Set(referenceNodeDataIds)];

    // AVANT le premier write : une référence refusée doit laisser le node
    // exactement dans l'état où l'utilisateur l'a trouvé, pas avec un prompt
    // à moitié enregistré et aucune image.
    const referenceUrls = await resolveReferenceImageUrls(ctx, {
      canvas,
      nodeDataId,
      referenceNodeDataIds: uniqueReferenceIds,
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
        imageReferences: uniqueReferenceIds,
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
        referenceUrls,
      },
    );

    return null;
  },
});
