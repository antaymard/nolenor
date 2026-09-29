"use node";

import { v } from "convex/values";
import { generateText, Output } from "ai";
import type { z } from "zod";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getOpenRouterLanguageModel } from "./agents";
import { extractOpenRouterCost } from "./usage";
import {
  TRANSCRIPT_CHAPTERS_BATCH_CHARS,
  TRANSCRIPT_CHAPTERS_SINGLE_CALL_MAX_CHARS,
  getTranscriptSummaryModel,
} from "../config/transcriptionConfig";
import { aiUsageSources } from "../schemas/aiUsageSourceSchema";
import {
  TRANSCRIPT_SUMMARY_SYSTEM,
  buildBatchChaptersPrompt,
  buildFullChaptersPrompt,
  buildOverviewFromChaptersPrompt,
  chaptersOnlySchema,
  cleanOverview,
  collectBatchedChapterDrafts,
  flattenTranscriptLines,
  fullChaptersSchema,
  overviewOnlySchema,
  resolveChapters,
  transcriptPromptChars,
  validateChapterDrafts,
  type ChapterDraft,
  type ResolvedChapter,
  type TranscriptLine,
} from "./helpers/transcriptSummaryPrompt";

type UsageTotals = {
  costUsd: number | undefined;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calls: number;
};

/**
 * Chapitres (titre + résumé) et vue d'ensemble du transcript d'un node audio.
 * Planifiée par `saveTranscript` seulement (cf. ia/transcription.ts).
 *
 * Les chapitres sont libres : le modèle les coupe aux changements de sujet, à
 * la ligne près (cf. helpers/transcriptSummaryPrompt). Un seul appel LLM pour
 * tout le fichier jusqu'à ≈ 2 h ; au-delà, par lots, chacun reprenant au
 * début du dernier chapitre du lot précédent pour ne pas couper un sujet à
 * la frontière. Sortie structurée validée par zod (ai-sdk). Un appel qui ne
 * rend aucun chapitre valide est retenté une fois.
 *
 * Jamais bloquante : un échec laisse un transcript sans chapitres, pleinement
 * utilisable. Rien n'est réessayé automatiquement au-delà de ça.
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

      const lines = flattenTranscriptLines(transcript.chunks);
      if (lines.length === 0) return null;
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

      /**
       * Chapitres de `batch`, validés ; un second essai si aucun ne l'est.
       * `overview` : celle de l'appel retenu, quand le prompt en demande une.
       */
      async function chaptersFor(
        batch: TranscriptLine[],
        prompt: string,
        withOverview: boolean,
      ): Promise<{ drafts: ChapterDraft[]; overview?: string }> {
        for (let attempt = 1; attempt <= 2; attempt++) {
          const output = withOverview
            ? await call(fullChaptersSchema, prompt)
            : { ...(await call(chaptersOnlySchema, prompt)), overview: "" };
          const drafts = validateChapterDrafts(batch, output.chapters);
          if (drafts.length > 0) {
            return { drafts, overview: cleanOverview(output.overview) };
          }
          console.warn("[transcriptSummary] no-valid-chapter", {
            nodeDataId,
            attempt,
            firstLine: batch[0].id,
          });
        }
        throw new Error("The model returned no valid chapter");
      }

      let overview: string | undefined;
      let chapters: ResolvedChapter[];

      if (
        transcriptPromptChars(lines) <=
        TRANSCRIPT_CHAPTERS_SINGLE_CALL_MAX_CHARS
      ) {
        const result = await chaptersFor(
          lines,
          buildFullChaptersPrompt(lines),
          true,
        );
        overview = result.overview;
        chapters = resolveChapters(
          lines,
          result.drafts,
          transcript.durationSec,
        );
      } else {
        // Audio long : lots successifs (cf. collectBatchedChapterDrafts).
        const drafts = await collectBatchedChapterDrafts(
          lines,
          TRANSCRIPT_CHAPTERS_BATCH_CHARS,
          async (batch, previousChapters) =>
            (
              await chaptersFor(
                batch,
                buildBatchChaptersPrompt({ lines: batch, previousChapters }),
                false,
              )
            ).drafts,
        );
        chapters = resolveChapters(lines, drafts, transcript.durationSec);
        if (chapters.length > 0) {
          const output = await call(
            overviewOnlySchema,
            buildOverviewFromChaptersPrompt(chapters),
          );
          overview = cleanOverview(output.overview);
        }
      }

      if (chapters.length === 0 && !overview) return null;

      const { saved } = await ctx.runMutation(
        internal.ia.transcription.saveTranscriptChapters,
        {
          nodeDataId,
          sourceKey,
          passageCount: transcript.chunks.length,
          overview,
          summaryModel: modelId,
          chapters,
        },
      );

      console.log("[transcriptSummary] done", {
        nodeDataId,
        model: modelId,
        saved,
        lines: lines.length,
        chapters: chapters.length,
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
