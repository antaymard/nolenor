"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { requestOpenRouterTranscription } from "./agents";
import {
  MAX_TRANSCRIPTION_BYTES,
  getTranscriptionModel,
} from "../config/transcriptionConfig";
import { aiUsageSources } from "../schemas/aiUsageSourceSchema";
import { getNodeDataTitle } from "../lib/getNodeDataTitle";
import { stripLoneSurrogates } from "../lib/textSanitize";
import { groupSegmentsIntoChunks } from "../lib/transcriptChunks";
import {
  EMBEDDING_MODEL_TAG,
  buildEmbeddingText,
  embedDocuments,
} from "../lib/voyage";

type ChunkInput = Omit<Doc<"searchableChunks">, "_id" | "_creationTime">;

function readFilename(nodeData: Doc<"nodeDatas">): string {
  const audio = nodeData.values.audio as { filename?: unknown } | undefined;
  return typeof audio?.filename === "string" && audio.filename.length > 0
    ? audio.filename
    : "audio";
}

/**
 * Transcrit un node audio et écrit le résultat en chunks `transcript`.
 *
 * Tout le corps est sous `try/catch` : la mutation a déjà rendu la main, et le
 * statut `error` sur le node est le seul moyen pour l'utilisateur d'apprendre
 * que sa transcription a échoué.
 */
export const runTranscription = internalAction({
  args: {
    nodeDataId: v.id("nodeDatas"),
    authUserId: v.id("users"),
    // Figée par la mutation : c'est le fichier que l'utilisateur a demandé à
    // transcrire, même s'il le remplace pendant l'appel (cf. saveTranscript).
    sourceKey: v.string(),
    audioUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { nodeDataId, authUserId, sourceKey, audioUrl }) => {
    try {
      const nodeData = await ctx.runQuery(
        internal.wrappers.nodeDataWrappers.readNodeData,
        { _id: nodeDataId },
      );
      if (!nodeData) return null;

      const download = await fetch(audioUrl);
      if (!download.ok) {
        throw new Error(
          `Could not download the audio file (${download.status}).`,
        );
      }
      const audio = await download.blob();
      // Revérifié sur les octets réels : `values.audio.size` est déclaratif,
      // et absent sur les vieux nodes.
      if (audio.size > MAX_TRANSCRIPTION_BYTES) {
        throw new Error(
          "This audio file is too large to be transcribed (max 25 MB).",
        );
      }

      const model = getTranscriptionModel();
      const result = await requestOpenRouterTranscription({
        model,
        audio,
        filename: readFilename(nodeData),
      });

      // Compté dès que l'appel a réussi, AVANT l'écriture : si la suite échoue
      // ou que le résultat est jeté (fichier remplacé en vol), la dépense a
      // quand même eu lieu. Jamais bloquant.
      try {
        await ctx.runMutation(internal.wrappers.aiUsageWrappers.recordUsage, {
          source: aiUsageSources.transcription,
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
          // Bruyant mais non bloquant : sans `cost`, la dépense de
          // transcription n'apparaît plus dans /settings/ai-usage.
          console.error("[aiUsage] transcription returned no cost", {
            model,
            nodeDataId,
          });
        }
      } catch (error) {
        console.error("[aiUsage] failed to record transcription usage", {
          nodeDataId,
          detail: error instanceof Error ? error.message : String(error),
        });
      }

      const drafts = groupSegmentsIntoChunks(result.segments);
      if (drafts.length === 0) {
        throw new Error("No speech was detected in this audio file.");
      }

      // Titre provisoire, pour l'embedding : `saveTranscript` impose le titre
      // courant au moment de l'écriture.
      const title = stripLoneSurrogates(getNodeDataTitle(nodeData));
      const chunks: ChunkInput[] = drafts.map((draft, order) => ({
        nodeDataId,
        canvasId: nodeData.canvasId,
        nodeType: nodeData.type,
        chunkType: "transcript",
        title,
        text: draft.text,
        order,
        metadata: {
          sourceKey,
          model,
          ...(result.language !== undefined && { language: result.language }),
          ...(result.durationSec !== undefined && {
            durationSec: result.durationSec,
          }),
          startSec: draft.startSec,
          endSec: draft.endSec,
          segments: draft.segments,
        },
      }));

      // Même dégradation que le chunkBuilder : sans Voyage, les chunks restent
      // trouvables en keyword, et le backfill d'embeddings les rattrapera.
      try {
        const embeddings = await embedDocuments(
          chunks.map((chunk) => buildEmbeddingText(chunk.title, chunk.text)),
        );
        chunks.forEach((chunk, i) => {
          chunk.embedding = embeddings[i];
          chunk.embeddingModel = EMBEDDING_MODEL_TAG;
        });
      } catch (error) {
        console.warn("[transcription] embed-failed", {
          nodeDataId,
          chunkCount: chunks.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const { saved } = await ctx.runMutation(
        internal.ia.transcription.saveTranscript,
        { nodeDataId, sourceKey, chunks, authUserId },
      );

      console.log("[transcription] done", {
        nodeDataId,
        model,
        saved,
        segmentCount: result.segments.length,
        chunkCount: chunks.length,
        durationSec: result.durationSec,
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Transcription failed.";
      console.error("[transcription] run failed", { nodeDataId, detail });

      await ctx.runMutation(internal.ia.transcription.failTranscription, {
        nodeDataId,
        sourceKey,
        error: detail,
      });
    }

    return null;
  },
});
