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
 * Les URLs des images à joindre à la génération, découvertes dynamiquement.
 *
 * Règle produit : quand l'inclusion est active, TOUTES les images des nodes
 * image branchés en ENTRÉE du node qui génère sont jointes, sans que personne
 * n'ait à les désigner. Rien n'est stocké : les edges du canvas sont la seule
 * source de vérité, lue ici au moment de générer — pas de dérive quand on
 * débranche, supprime ou vide une source.
 *
 * Tout écart BLOQUANT lève plutôt que de filtrer en silence (plafond du
 * modèle, modèle sans refs). En revanche une entrée qui n'apporte rien (node
 * non-image, image vidée de ses images) est simplement sautée : en inclusion
 * automatique, elle ne doit pas faire échouer une génération payante.
 *
 * Reçoit le `canvas` plutôt que d'aller le chercher : l'appelant l'a déjà en
 * main via `requireCanvasAccess`, et c'est le plus gros document de l'app —
 * le relire gonflerait le read-set de la mutation, donc sa surface de conflit
 * OCC avec chaque déplacement de node concurrent.
 */
async function resolveAutoReferenceImageUrls(
  ctx: MutationCtx,
  {
    canvas,
    nodeDataId,
    model,
  }: {
    canvas: Doc<"canvases">;
    nodeDataId: Id<"nodeDatas">;
    model: ImageModelValues;
  },
): Promise<string[]> {
  const maxReferences: number =
    imageModelOptions.find((option) => option.value === model)
      ?.maxReferenceImages ?? 0;

  // Une seule passe sur `canvas.nodes` : le node courant (pour retrouver son
  // id canvas, le seul langage des edges) et la correspondance `id canvas →
  // nodeDataId` pour les entrées.
  const nodeDataIdByCanvasId = new Map<string, string>();
  let selfNodeId: string | undefined;

  for (const node of canvas.nodes ?? []) {
    if (!node.nodeDataId) continue;
    if (node.nodeDataId === nodeDataId) selfNodeId = node.id;
    nodeDataIdByCanvasId.set(node.id, node.nodeDataId);
  }
  if (!selfNodeId) throw new ConvexError(errors.NODE_NOT_FOUND);

  // Ordre des edges préservé : c'est l'ordre d'envoi des références, et celui
  // que l'UI affiche.
  const seen = new Set<string>();
  const inputNodeDataIds: Id<"nodeDatas">[] = [];
  for (const edge of canvas.edges ?? []) {
    if (edge.target !== selfNodeId) continue;
    const ref = nodeDataIdByCanvasId.get(edge.source);
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    inputNodeDataIds.push(ref as Id<"nodeDatas">);
  }

  if (inputNodeDataIds.length === 0) return [];

  // Modèle sans refs mais entrées branchées : sans ce refus, l'utilisateur
  // paierait une image qui ignore silencieusement ses sources.
  if (maxReferences === 0) {
    throw new ConvexError(errors.IMAGE_GENERATION_MODEL_NO_REFERENCES);
  }

  const sources = await Promise.all(
    inputNodeDataIds.map((id) => ctx.db.get("nodeDatas", id)),
  );

  const urls: string[] = [];
  for (const source of sources) {
    if (!source || source.type !== "image") continue;
    const images = readStoredImages(source.values);
    if (images.length === 0) continue;
    urls.push(...images.map((image) => image.url));
  }

  if (urls.length === 0) return [];

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
    // Opt-out silencieux : `false` bloque l'inclusion auto des entrées,
    // `true`/omitted l'active. Quand l'arg est omis (agent via set_node_data,
    // vieux client), c'est la valeur stockée qui tranche, défaut `true`.
    includeReferences: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { nodeDataId, prompt, count, model, includeReferences },
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

    // Effectif : arg explicite > valeur stockée > défaut `true`. Stocké comme
    // booléen tri-état (`boolean | undefined`), seul `false` bloque.
    const storedInclude = (nodeData.values as Record<string, unknown>)
      .imageIncludeReferences;
    const effectiveInclude =
      includeReferences ?? (storedInclude === false ? false : true);

    // AVANT le premier write : des références refusées (plafond, modèle sans
    // refs) doivent laisser le node exactement dans l'état où l'utilisateur
    // l'a trouvé, pas avec un prompt à moitié enregistré et aucune image.
    const referenceUrls = effectiveInclude
      ? await resolveAutoReferenceImageUrls(ctx, {
          canvas,
          nodeDataId,
          model,
        })
      : [];

    // Le prompt est du contenu utilisateur : il va dans `values`, donc dans
    // l'historique de versions, et devient lisible par l'agent. L'actor est
    // dérivé de l'auth server-side, jamais reçu du client.
    //
    // `imageIncludeReferences` part dans le même write que le prompt : les
    // deux forment une intention unique, et un restore de version doit rendre
    // le couple, pas un prompt qui décrit des images qui ne sont plus jointes.
    await NodeDataModels.updateValues(ctx, {
      _id: nodeDataId,
      values: {
        imagePrompt: trimmedPrompt,
        imageIncludeReferences: effectiveInclude,
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
