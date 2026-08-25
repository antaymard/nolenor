import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { components } from "./_generated/api";
import { getThreadMetadata } from "@convex-dev/agent";
import * as MessageMetadataModels from "./models/messageMetadataModels";
import * as ThreadMetadataModels from "./models/threadMetadataModels";
import errors from "./config/errorsConfig";

/**
 * Le thread existe et appartient à l'appelant. Facteur commun aux deux queries
 * ci-dessous, séparées à dessein : voir `getThreadUsageSummary`.
 */
async function requireOwnedThread(
  ctx: QueryCtx,
  threadId: string,
): Promise<void> {
  const authUserId = await requireAuth(ctx);
  const thread = await getThreadMetadata(ctx, components.agent, { threadId });
  if (!thread || thread.userId !== authUserId) {
    throw new Error(errors.THREAD_NOT_FOUND_OR_FORBIDDEN);
  }
}

/**
 * Toutes les lignes de metadata du thread : ce que le rendu joint à chaque
 * bulle (modèle, usage, pièces jointes) et ce que les stats agrègent par modèle.
 *
 * Son read set se limite volontairement à la table `messageMetadata`, écrite
 * seulement aux deux bouts d'un tour (une ligne user à l'envoi, une ligne
 * assistant à la fin) — soit deux invalidations par tour.
 *
 * Le coût cumulé du thread se lisait ici auparavant, ce qui traînait
 * `threadMetadata` dans le read set. Or ce document est patché à CHAQUE step de
 * génération par le usageHandler (cf. ia/usage.ts, et `addUsage` qui y écrit un
 * `lastMessageTime: Date.now()` toujours différent). Un tour de 25 steps
 * relançait donc 25 fois ce `collect()` non borné, dont 23 pour réexpédier au
 * client un payload rigoureusement identique au précédent — et le lag grandissait
 * avec le thread.
 */
export const listThreadMessageMetadata = query({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    await requireOwnedThread(ctx, threadId);

    return {
      messageMetadata: await MessageMetadataModels.listByThreadId(ctx, {
        threadId,
      }),
    };
  },
});

/**
 * Combien de lignes récentes remonter pour retrouver la dernière ligne
 * assistant. Un tour écrit une ligne user puis une ligne assistant : elle est
 * normalement à un ou deux crans du bout. Cette borne absorbe une dizaine de
 * tours dont l'assistant n'aurait rien écrit (tours interrompus) ; au-delà, le
 * modèle rendu est `null` et le sélecteur retombe sur son défaut, ce qui est
 * déjà le comportement d'un thread sans réponse.
 */
const ASSISTANT_LOOKBACK_ROWS = 20;

/**
 * Compteurs d'en-tête : coût cumulé, dernier modèle utilisé, fenêtre de
 * contexte.
 *
 * Séparée de `listThreadMessageMetadata` parce qu'elle lit `threadMetadata` :
 * elle est donc réévaluée à chaque step de génération, et c'est irréductible —
 * le coût cumulé vit dans ce document. Ce qu'elle renvoie doit en contrepartie
 * rester O(1). D'où le scan borné plutôt qu'un `collect()` : sans lui la
 * séparation ne servirait à rien, on aurait seulement déplacé la lecture O(n)
 * dans celle des deux queries qui tourne le plus souvent.
 */
export const getThreadUsageSummary = query({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    await requireOwnedThread(ctx, threadId);

    const threadMetadata = await ThreadMetadataModels.findByThreadId(ctx, {
      threadId,
    });

    // Scan descendant : la première ligne assistant rencontrée est la plus
    // récente — ce que l'ancienne version obtenait en prenant la dernière d'un
    // `collect()` ascendant.
    const recent = await MessageMetadataModels.listRecentByThreadId(ctx, {
      threadId,
      limit: ASSISTANT_LOOKBACK_ROWS,
    });
    const lastAssistant = recent.find((row) => row.role === "assistant");

    return {
      totalCostUsd: threadMetadata?.totalUsageUsd ?? 0,
      lastModelUsed: lastAssistant?.model ?? null,
      contextWindowUsed: lastAssistant?.usage?.totalTokens ?? null,
    };
  },
});
