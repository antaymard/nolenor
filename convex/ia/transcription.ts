import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { requireAuth, requireCanvasAccess } from "../lib/auth";
import { enforceRateLimit } from "../lib/rateLimits";
import errors from "../config/errorsConfig";
import {
  getMaxTranscriptionBytes,
  STALE_TRANSCRIPTION_MS,
} from "../config/transcriptionConfig";
import { getNodeDataTitle } from "../lib/getNodeDataTitle";
import { stripLoneSurrogates } from "../lib/textSanitize";
import { searchableChunksValidator } from "../schemas/searchableChunksSchema";
import * as NodeDataModels from "../models/nodeDataModels";
import * as SearchableChunkModels from "../models/searchableChunkModels";

/** Le fichier d'un node audio, tel que stocké dans `values.audio`. */
type StoredAudio = {
  url?: unknown;
  key?: unknown;
  size?: unknown;
  filename?: unknown;
  mimeType?: unknown;
};

function readStoredAudio(nodeData: Doc<"nodeDatas">): {
  url: string;
  key: string;
  size: number | undefined;
} | null {
  const audio = nodeData.values.audio as StoredAudio | null | undefined;
  if (!audio) return null;
  if (typeof audio.url !== "string" || typeof audio.key !== "string") {
    return null;
  }
  return {
    url: audio.url,
    key: audio.key,
    size: typeof audio.size === "number" ? audio.size : undefined,
  };
}

/**
 * Lance la transcription d'un node audio.
 *
 * Rend la main immédiatement, comme `generateImages` : le travail part dans
 * une action planifiée, et une transcription déjà payée n'est pas perdue si
 * l'utilisateur ferme l'onglet. Le statut `running` vit hors `values`
 * (`nodeData.transcription`) ; le succès l'efface, et le transcript se lit
 * ensuite dans les chunks `transcript`.
 */
export const transcribeAudio = mutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
  },
  returns: v.null(),
  handler: async (ctx, { nodeDataId }) => {
    const authUserId = await requireAuth(ctx);

    // Chaque appel envoie de l'audio (jusqu'à plusieurs heures) à un STT
    // facturé à la durée.
    await enforceRateLimit(ctx, "audioTranscription", authUserId);

    const nodeData = await ctx.db.get(nodeDataId);
    if (!nodeData) throw new ConvexError(errors.NODE_DATA_NOT_FOUND);
    if (nodeData.type !== "audio") {
      throw new ConvexError(errors.TRANSCRIPTION_WRONG_NODE_TYPE);
    }

    await requireCanvasAccess(ctx, nodeData.canvasId, authUserId, "editor");

    const audio = readStoredAudio(nodeData);
    if (!audio) throw new ConvexError(errors.TRANSCRIPTION_NO_FILE);
    // Taille inconnue (vieux node) : on laisse partir, l'action revérifie sur
    // les octets réellement téléchargés.
    // 25 Mo sans voice-server, la limite d'upload (200 Mo) avec : au-delà de
    // 25 Mo, l'action passe par la découpe du voice-server.
    if (audio.size !== undefined && audio.size > getMaxTranscriptionBytes()) {
      throw new ConvexError(errors.TRANSCRIPTION_FILE_TOO_LARGE);
    }

    // Une seule transcription à la fois par node : deux runs concurrents se
    // disputeraient les chunks `transcript` et le statut.
    const running = nodeData.transcription;
    if (
      running?.status === "running" &&
      Date.now() - running.startedAt < STALE_TRANSCRIPTION_MS
    ) {
      throw new ConvexError(errors.TRANSCRIPTION_ALREADY_RUNNING);
    }

    await NodeDataModels.setTranscription(ctx, {
      nodeDataId,
      status: "running",
      sourceKey: audio.key,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.ia.transcriptionRun.runTranscription,
      {
        nodeDataId,
        authUserId,
        sourceKey: audio.key,
        audioUrl: audio.url,
      },
    );

    return null;
  },
});

/**
 * Plus gros fichier transcriptible. Servi par le backend plutôt que codé en
 * dur côté client : il dépend de la présence du voice-server (env Convex).
 */
export const getTranscriptionLimits = query({
  args: {},
  returns: v.object({ maxBytes: v.number() }),
  handler: async () => ({ maxBytes: getMaxTranscriptionBytes() }),
});

const transcriptSegmentValidator = v.object({
  s: v.number(),
  e: v.number(),
  text: v.string(),
});

/**
 * Le transcript du fichier COURANT d'un node audio, segment par segment,
 * reconstruit depuis les chunks `transcript` (cf. `lib/transcriptChunks.ts`).
 * `null` quand il n'y a pas de transcript pour ce fichier.
 */
export const getTranscript = query({
  args: {
    nodeDataId: v.id("nodeDatas"),
  },
  returns: v.union(
    v.null(),
    v.object({
      sourceKey: v.string(),
      model: v.optional(v.string()),
      language: v.optional(v.string()),
      durationSec: v.optional(v.number()),
      overview: v.optional(v.string()),
      chunks: v.array(
        v.object({
          order: v.number(),
          startSec: v.number(),
          endSec: v.number(),
          passageTitle: v.optional(v.string()),
          summary: v.optional(v.string()),
          segments: v.array(transcriptSegmentValidator),
        }),
      ),
    }),
  ),
  handler: async (ctx, { nodeDataId }) => {
    const authUserId = await requireAuth(ctx);
    const nodeData = await ctx.db.get(nodeDataId);
    if (!nodeData) throw new ConvexError(errors.NODE_DATA_NOT_FOUND);
    await requireCanvasAccess(ctx, nodeData.canvasId, authUserId);

    const audio = readStoredAudio(nodeData);
    if (!audio) return null;

    const transcript = await SearchableChunkModels.getCurrentTranscript(ctx, {
      nodeDataId,
      sourceKey: audio.key,
    });
    return transcript ? { sourceKey: audio.key, ...transcript } : null;
  },
});

/**
 * Le fichier courant a-t-il un transcript ? Pour la toolbar, qui n'a besoin
 * que de savoir quoi afficher : bien plus léger que `getTranscript`.
 */
export const hasTranscript = query({
  args: {
    nodeDataId: v.id("nodeDatas"),
  },
  returns: v.boolean(),
  handler: async (ctx, { nodeDataId }) => {
    const authUserId = await requireAuth(ctx);
    const nodeData = await ctx.db.get(nodeDataId);
    if (!nodeData) throw new ConvexError(errors.NODE_DATA_NOT_FOUND);
    await requireCanvasAccess(ctx, nodeData.canvasId, authUserId);

    const audio = readStoredAudio(nodeData);
    if (!audio) return false;
    return await SearchableChunkModels.hasTranscript(ctx, {
      nodeDataId,
      sourceKey: audio.key,
    });
  },
});

// ── Internes (appelées par ia/transcriptionRun.ts) ─────────────────────────

/**
 * Écrit le transcript et éteint le statut, dans UNE transaction.
 *
 * Revérifie que le node porte toujours le fichier transcrit : si
 * l'utilisateur l'a remplacé pendant l'appel au STT, le résultat décrit un
 * fichier qui n'est plus là. On le jette plutôt que d'indexer un transcript
 * faux — le rebuild déclenché par le remplacement a déjà nettoyé le reste.
 *
 * Le titre est relu ici, pas reçu de l'action : un renommage survenu pendant
 * la transcription doit être celui que portent les chunks.
 */
export const saveTranscript = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    sourceKey: v.string(),
    chunks: v.array(v.object(searchableChunksValidator.fields)),
    // Qui a lancé la transcription : l'étape de résumé lui est imputée.
    authUserId: v.id("users"),
  },
  returns: v.object({ saved: v.boolean() }),
  handler: async (ctx, { nodeDataId, sourceKey, chunks, authUserId }) => {
    const nodeData = await ctx.db.get(nodeDataId);
    if (!nodeData) return { saved: false };

    const audio = readStoredAudio(nodeData);
    if (!audio || audio.key !== sourceKey) {
      // Le statut ne concerne plus le fichier courant : on l'efface aussi.
      if (nodeData.transcription?.sourceKey === sourceKey) {
        await NodeDataModels.clearTranscription(ctx, { nodeDataId });
      }
      return { saved: false };
    }

    const title = stripLoneSurrogates(getNodeDataTitle(nodeData));
    await SearchableChunkModels.replaceTranscriptChunks(ctx, {
      nodeDataId,
      chunks: chunks.map((chunk) => ({
        ...chunk,
        // Tous les champs d'appartenance sont imposés ici, jamais crus de
        // l'action : un chunk `transcript` appartient à CE node, sur SON canvas.
        nodeDataId,
        canvasId: nodeData.canvasId,
        nodeType: nodeData.type,
        chunkType: "transcript" as const,
        title,
      })),
    });
    await NodeDataModels.clearTranscription(ctx, { nodeDataId });

    // Seul déclencheur des résumés : une transcription qui vient d'être
    // écrite. Le chunkBuilder n'en planifie jamais, donc aucun write de
    // `values` (renommage, boucle…) ne les relance. Étape à part : le
    // transcript est lisible tout de suite, et son échec ne casse rien.
    await ctx.scheduler.runAfter(
      0,
      internal.ia.transcriptSummaryRun.summarizeTranscript,
      { nodeDataId, sourceKey, authUserId },
    );
    return { saved: true };
  },
});

/**
 * Écrit les résumés dans la `metadata` des chunks `transcript` — ni `text`,
 * ni embedding, ni `values` : aucune réindexation, aucun rebuild. Jetés si le
 * transcript a changé pendant l'appel LLM (cf. `patchTranscriptSummaries`).
 */
export const saveTranscriptSummaries = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    sourceKey: v.string(),
    passageCount: v.number(),
    overview: v.optional(v.string()),
    summaryModel: v.string(),
    passages: v.array(
      v.object({ order: v.number(), title: v.string(), summary: v.string() }),
    ),
  },
  returns: v.object({ saved: v.boolean() }),
  handler: async (ctx, args) => ({
    saved: await SearchableChunkModels.patchTranscriptSummaries(ctx, args),
  }),
});

/** Avancement d'une transcription longue (morceaux transcrits / total). */
export const setTranscriptionProgress = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    sourceKey: v.string(),
    done: v.number(),
    total: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await NodeDataModels.setTranscriptionProgress(ctx, args);
    return null;
  },
});

/** Passe le statut en erreur, si le run concerne toujours le fichier courant. */
export const failTranscription = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    sourceKey: v.string(),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { nodeDataId, sourceKey, error }) => {
    const nodeData = await ctx.db.get(nodeDataId);
    if (!nodeData) return null;
    if (nodeData.transcription?.sourceKey !== sourceKey) return null;
    await NodeDataModels.setTranscription(ctx, {
      nodeDataId,
      status: "error",
      sourceKey,
      error,
    });
    return null;
  },
});
