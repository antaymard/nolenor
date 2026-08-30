import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { components } from "./_generated/api";
import { getThreadMetadata } from "@convex-dev/agent";
import * as MessageMetadataModels from "./models/messageMetadataModels";
import * as ThreadMetadataModels from "./models/threadMetadataModels";
import { messageMetadataValidator } from "./schemas/messageMetadataSchema";
import errors from "./config/errorsConfig";

/**
 * Les métadonnées d'un thread sont servies par DEUX queries, et pas une seule,
 * parce que ses deux moitiés n'ont pas du tout la même cadence.
 *
 * `threadMetadata` est patché une fois par step LLM (`addUsage`, jusqu'à 25 par
 * tour, et il stampe `lastMessageTime` même à coût nul) et une fois par appel
 * d'outil (`recordActivity`). Toute query qui le lit est donc réinvalidée une
 * quarantaine de fois par tour. Tant que l'historique complet des lignes
 * `messageMetadata` était dans le même read set, il était re-collecté et
 * repoussé autant de fois — un coût quadratique en longueur de conversation,
 * qui est exactement ce qui rendait le panneau de plus en plus laggy.
 *
 * D'où la coupure :
 * - `getThreadUsageSummary` lit le doc chaud, mais ne renvoie qu'un objet de
 *   taille fixe ;
 * - `listThreadMessageMetadata` renvoie l'historique, mais ne lit plus le doc
 *   chaud — seulement les lignes du thread, qui ne bougent qu'à l'insertion,
 *   soit deux fois par tour.
 */

const messageMetadataDocValidator = v.object({
  _id: v.id("messageMetadata"),
  _creationTime: v.number(),
  ...messageMetadataValidator.fields,
});

const usageSummaryValidator = v.object({
  totalCostUsd: v.number(),
  lastModelUsed: v.union(v.string(), v.null()),
  contextWindowUsed: v.union(v.number(), v.null()),
});

/**
 * Le récapitulatif d'usage du thread : coût cumulé, dernier modèle utilisé,
 * fenêtre de contexte occupée.
 *
 * Read set volontairement minuscule et de taille fixe : le doc `threadMetadata`
 * (coût cumulé par le `usageHandler` de l'agent, pas dérivé par message) et la
 * seule dernière ligne assistant, lue par index.
 */
export const getThreadUsageSummary = query({
  args: { threadId: v.string() },
  returns: usageSummaryValidator,
  handler: async (ctx, { threadId }) => {
    const authUserId = await requireAuth(ctx);

    const thread = await getThreadMetadata(ctx, components.agent, {
      threadId,
    });
    if (!thread || thread.userId !== authUserId) {
      throw new Error(errors.THREAD_NOT_FOUND_OR_FORBIDDEN);
    }

    const threadMetadata = await ThreadMetadataModels.findByThreadId(ctx, {
      threadId,
    });

    const lastAssistant =
      await MessageMetadataModels.findLastAssistantByThreadId(ctx, {
        threadId,
      });

    // `usage` est un record opaque côté schéma : on ne promet un nombre au
    // validateur de sortie que si c'en est un.
    const totalTokens = lastAssistant?.usage?.totalTokens;

    return {
      totalCostUsd: threadMetadata?.totalUsageUsd ?? 0,
      lastModelUsed: lastAssistant?.model ?? null,
      contextWindowUsed: typeof totalTokens === "number" ? totalTokens : null,
    };
  },
});

/**
 * Les lignes de métadonnées par message : modèle et usage d'un tour assistant,
 * pièces jointes d'un message utilisateur.
 *
 * Ce que cette query NE lit PAS est aussi important que ce qu'elle lit : le doc
 * `threadMetadata`. C'est lui qui est patché une quarantaine de fois par tour,
 * et le garder dans ce read set faisait repartir tout l'historique sur le
 * websocket à chaque step.
 *
 * Le contrôle de propriété, lui, reste exactement celui d'avant — le doc thread
 * du composant agent — parce qu'il est froid : ce document n'est écrit que par
 * un `updateThreadMetadata` explicite, c'est-à-dire ici le seul
 * `threads.updateThreadTitle`, une fois dans la vie du thread.
 *
 * Le vérifier sur les lignes elles-mêmes serait tentant (elles portent déjà
 * `userId`) mais faux : `ia.nole.saveMessage` autorise sur l'accès *éditeur au
 * canvas*, pas sur la propriété du thread, donc un collaborateur peut laisser
 * une ligne à son nom dans le thread de quelqu'un d'autre.
 */
export const listThreadMessageMetadata = query({
  args: { threadId: v.string() },
  returns: v.array(messageMetadataDocValidator),
  handler: async (ctx, { threadId }) => {
    const authUserId = await requireAuth(ctx);

    const thread = await getThreadMetadata(ctx, components.agent, {
      threadId,
    });
    if (!thread || thread.userId !== authUserId) {
      throw new Error(errors.THREAD_NOT_FOUND_OR_FORBIDDEN);
    }

    return await MessageMetadataModels.listByThreadId(ctx, { threadId });
  },
});
