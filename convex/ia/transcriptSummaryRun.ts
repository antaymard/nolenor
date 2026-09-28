"use node";

import { v } from "convex/values";
import { generateText, Output } from "ai";
import type { z } from "zod";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getOpenRouterLanguageModel } from "./agents";
import { extractOpenRouterCost } from "./usage";
import {
  TRANSCRIPT_SUMMARY_BATCH_SIZE,
  TRANSCRIPT_SUMMARY_SINGLE_CALL_MAX_PASSAGES,
  getTranscriptSummaryModel,
} from "../config/transcriptionConfig";
import { aiUsageSources } from "../schemas/aiUsageSourceSchema";
import {
  TRANSCRIPT_SUMMARY_SYSTEM,
  buildFullSummaryPrompt,
  buildOverviewFromSummariesPrompt,
  buildPassagesPrompt,
  cleanOverview,
  fullSummarySchema,
  matchPassageSummaries,
  overviewOnlySchema,
  passagesOnlySchema,
  splitIntoBatches,
  withNeighbours,
  type PassageSummary,
  type SummaryPassage,
} from "./helpers/transcriptSummaryPrompt";

type UsageTotals = {
  costUsd: number | undefined;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calls: number;
};

/**
 * Titre + résumé par passage, et vue d'ensemble, pour le transcript d'un node
 * audio. Planifiée par `saveTranscript` seulement (cf. ia/transcription.ts).
 *
 * Un seul appel LLM pour tout le fichier (≈ 15k tokens pour 1 h), plus un
 * rattrapage ciblé des passages manquants ; par lots au-delà de
 * `TRANSCRIPT_SUMMARY_SINGLE_CALL_MAX_PASSAGES`. Sortie structurée validée
 * par zod (ai-sdk), rapprochée par `id` (cf. helpers/transcriptSummaryPrompt).
 *
 * Jamais bloquante : un échec laisse un transcript sans résumés, pleinement
 * utilisable. Rien n'est réessayé automatiquement.
 */
export const summarizeTranscript = internalAction({
  args: {
    nodeDataId: v.id("nodeDatas"),
    sourceKey: v.string(),
    authUserId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { nodeDataId, sourceKey, authUserId }) => {
    const modelId = getTranscriptSummaryModel();
    const usage: UsageTotals = {
      costUsd: undefined,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      calls: 0,
    };

    try {
      const transcript = await ctx.runQuery(
        internal.wrappers.searchableChunkWrappers.getCurrentTranscript,
        { nodeDataId, sourceKey },
      );
      if (!transcript || transcript.chunks.length === 0) return null;

      const passages: SummaryPassage[] = transcript.chunks.map((chunk) => ({
        order: chunk.order,
        startSec: chunk.startSec,
        endSec: chunk.endSec,
        text: chunk.segments.map((segment) => segment.text).join(" "),
      }));
      const model = getOpenRouterLanguageModel(modelId);

      async function call<S extends z.ZodType>(
        schema: S,
        prompt: string,
      ): Promise<z.infer<S>> {
        const result = await generateText({
          model,
          system: TRANSCRIPT_SUMMARY_SYSTEM,
          prompt,
          temperature: 0.2,
          output: Output.object({ schema }),
        });
        const { costUsd } = extractOpenRouterCost({
          usage: result.usage,
          providerMetadata: result.providerMetadata,
        });
        if (costUsd !== undefined) {
          usage.costUsd = (usage.costUsd ?? 0) + costUsd;
        }
        usage.inputTokens += result.usage.inputTokens ?? 0;
        usage.outputTokens += result.usage.outputTokens ?? 0;
        usage.totalTokens += result.usage.totalTokens ?? 0;
        usage.calls += 1;
        return result.output as z.infer<S>;
      }

      const allOrders = passages.map((passage) => passage.order);
      const summaries = new Map<number, PassageSummary>();
      let overview: string | undefined;

      if (passages.length <= TRANSCRIPT_SUMMARY_SINGLE_CALL_MAX_PASSAGES) {
        const output = await call(
          fullSummarySchema,
          buildFullSummaryPrompt(passages),
        );
        overview = cleanOverview(output.overview);
        for (const [order, summary] of matchPassageSummaries(
          allOrders,
          output.passages,
        )) {
          summaries.set(order, summary);
        }
      } else {
        // Audio long : lots successifs, chacun avec le fil des précédents.
        let previousSummary: string | undefined;
        for (const batch of splitIntoBatches(
          passages,
          TRANSCRIPT_SUMMARY_BATCH_SIZE,
        )) {
          const output = await call(
            passagesOnlySchema,
            buildPassagesPrompt({ targets: batch, previousSummary }),
          );
          const matched = matchPassageSummaries(
            batch.map((passage) => passage.order),
            output.passages,
          );
          for (const [order, summary] of matched) summaries.set(order, summary);
          previousSummary = [...matched.values()]
            .map((summary) => `${summary.title}: ${summary.summary}`)
            .join("\n");
        }
      }

      // Rattrapage : un second appel, sur les seuls passages manquants.
      const missing = allOrders.filter((order) => !summaries.has(order));
      if (missing.length > 0) {
        console.warn("[transcriptSummary] missing-passages:retry", {
          nodeDataId,
          missing,
        });
        const { targets, context } = withNeighbours(passages, missing);
        const output = await call(
          passagesOnlySchema,
          buildPassagesPrompt({ targets, context }),
        );
        for (const [order, summary] of matchPassageSummaries(
          missing,
          output.passages,
        )) {
          summaries.set(order, summary);
        }
      }

      if (overview === undefined && summaries.size > 0) {
        const output = await call(
          overviewOnlySchema,
          buildOverviewFromSummariesPrompt(
            passages
              .filter((passage) => summaries.has(passage.order))
              .map((passage) => ({
                ...summaries.get(passage.order)!,
                startSec: passage.startSec,
              })),
          ),
        );
        overview = cleanOverview(output.overview);
      }

      const { saved } = await ctx.runMutation(
        internal.ia.transcription.saveTranscriptSummaries,
        {
          nodeDataId,
          sourceKey,
          passageCount: passages.length,
          overview,
          summaryModel: modelId,
          passages: [...summaries.values()],
        },
      );

      console.log("[transcriptSummary] done", {
        nodeDataId,
        model: modelId,
        saved,
        passages: passages.length,
        summarized: summaries.size,
        calls: usage.calls,
      });
    } catch (error) {
      console.error("[transcriptSummary] failed", {
        nodeDataId,
        model: modelId,
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      // Compté même en cas d'échec partiel : les appels passés sont payés.
      if (usage.calls > 0) {
        try {
          await ctx.runMutation(internal.wrappers.aiUsageWrappers.recordUsage, {
            source: aiUsageSources.transcription,
            userId: authUserId,
            model: modelId,
            provider: "openrouter",
            costUsd: usage.costUsd,
            tokens: {
              inputTokens: usage.inputTokens,
              cachedInputTokens: 0,
              cacheWriteTokens: 0,
              outputTokens: usage.outputTokens,
              reasoningTokens: 0,
              totalTokens: usage.totalTokens,
            },
          });
          if (usage.costUsd === undefined) {
            console.error("[aiUsage] transcript summary returned no cost", {
              model: modelId,
              nodeDataId,
            });
          }
        } catch (error) {
          console.error("[aiUsage] failed to record transcript summary usage", {
            nodeDataId,
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return null;
  },
});
