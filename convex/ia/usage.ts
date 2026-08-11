import type { UsageHandler } from "@convex-dev/agent";
import { internal } from "../_generated/api";
import type { AiUsageSource } from "../schemas/aiUsageSourceSchema";

/**
 * Lit un champ numérique dans une valeur JSON de provenance inconnue
 * (`usage.raw` et `providerMetadata` sont des JSON opaques), sans cast menteur.
 */
function readNumber(source: unknown, key: string): number | undefined {
  if (typeof source !== "object" || source === null) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

function readObject(source: unknown, key: string): unknown {
  if (typeof source !== "object" || source === null) return undefined;
  return (source as Record<string, unknown>)[key];
}

type UsageHandlerArgs = Parameters<UsageHandler>[1];

/**
 * Coût facturé par OpenRouter pour ce step. OpenRouter l'expose à deux
 * endroits alimentés par le même champ de sa réponse : on lit les deux, pour
 * qu'une version du provider qui en retirerait un ne casse pas la
 * comptabilité.
 *
 * Aucun calcul local à partir de `chatModelOptions[].price` : une estimation
 * fausse serait indétectable a posteriori, alors qu'un coût absent se voit.
 * `undefined` ici veut dire « OpenRouter n'a rien dit », pas « gratuit » — un
 * modèle réellement gratuit renvoie `cost: 0`.
 */
function extractCost(args: UsageHandlerArgs): {
  costUsd: number | undefined;
  upstreamCostUsd: number | undefined;
} {
  const rawUsage = args.usage?.raw;
  const openrouterUsage = readObject(
    readObject(args.providerMetadata, "openrouter"),
    "usage",
  );

  return {
    costUsd: readNumber(rawUsage, "cost") ?? readNumber(openrouterUsage, "cost"),
    upstreamCostUsd:
      readNumber(readObject(rawUsage, "cost_details"), "upstream_inference_cost") ??
      readNumber(
        readObject(openrouterUsage, "costDetails"),
        "upstreamInferenceCost",
      ),
  };
}

/**
 * `usageHandler` partagé par tous les agents qui appellent réellement un LLM.
 *
 * Appelé UNE FOIS PAR STEP par le composant agent, pas une fois par tour : un
 * tour Nolë de 25 steps produit 25 événements. C'est voulu — le coût n'est
 * disponible que sur l'usage par step, `result.totalUsage` perdant le champ
 * `raw` du provider en agrégeant.
 *
 * Ne throw jamais : il s'exécute à l'intérieur de la boucle de génération,
 * après que la réponse a déjà été streamée. Faire échouer un tour parce que la
 * comptabilité a raté serait le pire des deux mondes.
 */
export function createUsageHandler(source: AiUsageSource): UsageHandler {
  return async (ctx, args) => {
    try {
      const { costUsd, upstreamCostUsd } = extractCost(args);

      if (costUsd === undefined) {
        // Bruyant mais non bloquant. Si cette ligne apparaît, c'est presque
        // toujours que l'usage accounting OpenRouter (`usage: { include: true }`
        // sur les settings du modèle, cf. ia/agents.ts) n'a pas été appliqué
        // sur ce chemin.
        console.error("[aiUsage] provider returned no cost", {
          source,
          model: args.model,
          provider: args.provider,
          threadId: args.threadId,
        });
      }

      const usage = args.usage;
      await ctx.runMutation(internal.wrappers.aiUsageWrappers.recordUsage, {
        source,
        userId: args.userId,
        threadId: args.threadId,
        agentName: args.agentName,
        model: args.model,
        provider: args.provider,
        costUsd,
        upstreamCostUsd,
        // Forme PLATE de `LanguageModelUsage` (ai@6) : `inputTokens` inclut
        // déjà les tokens de cache et `outputTokens` les tokens de reasoning.
        // Ne surtout pas la confondre avec la forme imbriquée
        // `LanguageModelV3Usage` de @ai-sdk/provider.
        tokens: {
          inputTokens: usage?.inputTokens ?? 0,
          cachedInputTokens: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
          cacheWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? 0,
          totalTokens: usage?.totalTokens ?? 0,
        },
      });
    } catch (error) {
      console.error("[aiUsage] failed to record usage", {
        source,
        model: args.model,
        threadId: args.threadId,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
