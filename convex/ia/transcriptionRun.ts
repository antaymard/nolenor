"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import {
  requestOpenRouterTranscription,
  type OpenRouterTranscriptionResult,
} from "./agents";
import {
  MAX_TRANSCRIPTION_DIRECT_BYTES,
  TRANSCRIPTION_PARALLELISM,
  TRANSCRIPTION_PART_SECONDS,
  TRANSCRIPTION_POLL_MS,
  TRANSCRIPTION_TIME_BUDGET_MS,
  getTranscriptionModel,
  getTranscriptionModelProviders,
  getVoiceServerMediaConfig,
} from "../config/transcriptionConfig";
import { aiUsageSources } from "../schemas/aiUsageSourceSchema";
import { getNodeDataTitle } from "../lib/getNodeDataTitle";
import { stripLoneSurrogates } from "../lib/textSanitize";
import {
  groupSegmentsIntoChunks,
  type RawTranscriptSegment,
} from "../lib/transcriptChunks";
import {
  EMBEDDING_MODEL_TAG,
  buildEmbeddingText,
  embedDocuments,
} from "../lib/voyage";
import { transcribeLongAudio } from "./helpers/longTranscription";

type ChunkInput = Omit<Doc<"searchableChunks">, "_id" | "_creationTime">;

const TOO_LARGE_MESSAGE = "This audio file is too large to be transcribed.";

function readFilename(nodeData: Doc<"nodeDatas">): string {
  const audio = nodeData.values.audio as { filename?: unknown } | undefined;
  return typeof audio?.filename === "string" && audio.filename.length > 0
    ? audio.filename
    : "audio";
}

/** Taille déclarée à l'upload ; absente sur les vieux nodes. */
function readDeclaredSize(nodeData: Doc<"nodeDatas">): number | undefined {
  const audio = nodeData.values.audio as { size?: unknown } | undefined;
  return typeof audio?.size === "number" ? audio.size : undefined;
}

/** Dépense STT cumulée sur tous les appels d'un run (un par morceau en long). */
type UsageTotals = {
  calls: number;
  costUsd: number | undefined;
  unpricedCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

function addUsage(totals: UsageTotals, result: OpenRouterTranscriptionResult) {
  totals.calls += 1;
  if (result.costUsd === undefined) totals.unpricedCalls += 1;
  else totals.costUsd = (totals.costUsd ?? 0) + result.costUsd;
  totals.inputTokens += result.tokens.inputTokens;
  totals.outputTokens += result.tokens.outputTokens;
  totals.totalTokens += result.tokens.totalTokens;
}

/**
 * Transcrit un node audio et écrit le résultat en chunks `transcript`.
 *
 * Deux chemins, choisis par taille :
 * - jusqu'à 25 Mo, le fichier part tel quel au STT (un seul appel) ;
 * - au-delà, le voice-server le découpe en morceaux (~20 min, coupés dans
 *   les silences), transcrits en parallèle puis recollés (cf.
 *   helpers/longTranscription.ts). Désactivé sans `VOICE_SERVER_URL`.
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
    const deadline = Date.now() + TRANSCRIPTION_TIME_BUDGET_MS;
    const model = getTranscriptionModel();
    const onlyProviders = getTranscriptionModelProviders();
    const usage: UsageTotals = {
      calls: 0,
      costUsd: undefined,
      unpricedCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    try {
      const nodeData = await ctx.runQuery(
        internal.wrappers.nodeDataWrappers.readNodeData,
        { _id: nodeDataId },
      );
      if (!nodeData) return null;
      const filename = readFilename(nodeData);

      const transcribe = async (audio: Blob, name: string) => {
        const result = await requestOpenRouterTranscription({
          model,
          audio,
          filename: name,
          onlyProviders
        });
        addUsage(usage, result);
        return result;
      };

      const transcribeViaVoiceServer = async () => {
        const voiceServer = getVoiceServerMediaConfig();
        if (!voiceServer) throw new Error(TOO_LARGE_MESSAGE);
        return await transcribeLongAudio({
          voiceServer,
          sourceUrl: audioUrl,
          partSeconds: TRANSCRIPTION_PART_SECONDS,
          parallelism: TRANSCRIPTION_PARALLELISM,
          pollMs: TRANSCRIPTION_POLL_MS,
          deadline,
          transcribePart: async (audio, part) => {
            const result = await transcribe(audio, `part-${part.index}.mp3`);
            return { segments: result.segments, language: result.language };
          },
          // Cosmétique : une écriture ratée ne doit pas faire échouer une
          // transcription dont les morceaux sont déjà payés.
          onProgress: async (done, total) => {
            try {
              await ctx.runMutation(
                internal.ia.transcription.setTranscriptionProgress,
                { nodeDataId, sourceKey, done, total },
              );
            } catch (error) {
              console.warn("[transcription] progress update failed", {
                nodeDataId,
                detail: error instanceof Error ? error.message : String(error),
              });
            }
          },
        });
      };

      let outcome: {
        segments: RawTranscriptSegment[];
        language: string | undefined;
        durationSec: number | undefined;
      };

      const declaredSize = readDeclaredSize(nodeData);
      if (
        declaredSize !== undefined &&
        declaredSize > MAX_TRANSCRIPTION_DIRECT_BYTES
      ) {
        outcome = await transcribeViaVoiceServer();
      } else {
        const download = await fetch(audioUrl);
        if (!download.ok) {
          throw new Error(
            `Could not download the audio file (${download.status}).`,
          );
        }
        // Taille réelle, avant de lire le corps : `values.audio.size` est
        // déclaratif et absent sur les vieux nodes. Trop gros pour le chemin
        // direct → on n'en charge rien en mémoire, le voice-server le relira.
        const contentLength = Number(download.headers.get("content-length"));
        if (contentLength > MAX_TRANSCRIPTION_DIRECT_BYTES) {
          await download.body?.cancel();
          outcome = await transcribeViaVoiceServer();
        } else {
          const audio = await download.blob();
          if (audio.size > MAX_TRANSCRIPTION_DIRECT_BYTES) {
            outcome = await transcribeViaVoiceServer();
          } else {
            const result = await transcribe(audio, filename);
            outcome = {
              segments: result.segments,
              language: result.language,
              durationSec: result.durationSec,
            };
          }
        }
      }

      const drafts = groupSegmentsIntoChunks(outcome.segments);
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
          ...(outcome.language !== undefined && {
            language: outcome.language,
          }),
          ...(outcome.durationSec !== undefined && {
            durationSec: outcome.durationSec,
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
        segmentCount: outcome.segments.length,
        chunkCount: chunks.length,
        durationSec: outcome.durationSec,
        sttCalls: usage.calls,
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
    } finally {
      // Compté même si la suite échoue ou que le résultat est jeté (fichier
      // remplacé en vol) : les appels STT passés sont payés. Un seul événement
      // pour tout le run, morceaux compris. Jamais bloquant.
      if (usage.calls > 0) {
        try {
          await ctx.runMutation(internal.wrappers.aiUsageWrappers.recordUsage, {
            source: aiUsageSources.transcription,
            userId: authUserId,
            model,
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
          if (usage.unpricedCalls > 0) {
            // Bruyant mais non bloquant : sans `cost`, cette dépense manque
            // (en tout ou partie) dans /settings/ai-usage.
            console.error("[aiUsage] transcription returned no cost", {
              model,
              nodeDataId,
              unpricedCalls: usage.unpricedCalls,
              calls: usage.calls,
            });
          }
        } catch (error) {
          console.error("[aiUsage] failed to record transcription usage", {
            nodeDataId,
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return null;
  },
});
