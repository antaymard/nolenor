import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { isNodeTypeEmbedded } from "./config/nodeConfig";
import { buildEmbeddingText, embedDocuments } from "./lib/voyage";

// ── Backfill des embeddings Voyage-4 ────────────────────────────────────────
// Chunks créés avant l'indexation vectorielle (ou dont l'embed a échoué) :
// `embedding` absent ou tagué d'un autre modèle. Balayage paginé (100 docs /
// transaction), embed via Voyage, patch, puis chaînage au scheduler.
//
// Les types exclus via `nodeConfig` (`search.embed: false` : title, embed,
// audio, video, viewport) ne sont jamais vectorisés : leurs chunks restent
// keyword seuls.
//
// Lancer avec : `npx convex run migrations:backfillEmbeddings '{}'`
// (ou depuis le dashboard). Idempotent : relançable sans risque.
// Pour un seul canvas :
// `npx convex run migrations:backfillEmbeddings '{"canvasId":"<id>"}'`

const PAGE_SIZE = 100;

export const backfillEmbeddings = internalAction({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    canvasId: v.optional(v.id("canvases")),
  },
  returns: v.object({
    done: v.boolean(),
    processed: v.number(),
    embedded: v.number(),
    continueCursor: v.optional(v.string()),
  }),
  // Annotation explicite : l'action se re-schedule elle-même via `internal`
  // (même fichier), sans quoi l'inférence TS boucle (cf. guidelines).
  handler: async (
    ctx,
    args,
  ): Promise<{
    done: boolean;
    processed: number;
    embedded: number;
    continueCursor: string | undefined;
  }> => {
    const numItems = Math.min(Math.max(args.limit ?? PAGE_SIZE, 1), PAGE_SIZE);
    const slice = await ctx.runQuery(
      internal.wrappers.searchableChunkWrappers.listChunkPage,
      {
        paginationOpts: { numItems, cursor: args.cursor ?? null },
        canvasId: args.canvasId,
      },
    );

    const missing = slice.page.filter(
      (chunk) =>
        isNodeTypeEmbedded(chunk.nodeType) &&
        chunk.needsEmbedding &&
        buildEmbeddingText(chunk.title, chunk.text).length > 0,
    );

    let embedded = 0;
    if (missing.length > 0) {
      // Lève si Voyage échoue (clé, réseau, quota) : on ne schedule PAS la
      // suite pour éviter une boucle chaude qui brûle du quota. Relancer
      // manuellement une fois la cause corrigée (idempotent).
      const embeddings = await embedDocuments(
        missing.map((chunk) => buildEmbeddingText(chunk.title, chunk.text)),
      );
      await ctx.runMutation(
        internal.wrappers.searchableChunkWrappers.patchChunkEmbeddings,
        {
          items: missing.map((chunk, i) => ({
            id: chunk._id,
            embedding: embeddings[i]!,
          })),
        },
      );
      embedded = missing.length;
    }

    console.log("[migrations] backfillEmbeddings:page", {
      processed: slice.page.length,
      embedded,
      isDone: slice.isDone,
    });

    const continueCursor: string | undefined = slice.isDone
      ? undefined
      : slice.continueCursor;
    if (!slice.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillEmbeddings, {
        cursor: slice.continueCursor,
        limit: numItems,
        canvasId: args.canvasId,
      });
    } else {
      console.log("[migrations] backfillEmbeddings:complete");
    }

    return {
      done: slice.isDone,
      processed: slice.page.length,
      embedded,
      continueCursor,
    };
  },
});

// ── Purge des embeddings des types exclus (`search.embed: false`) ───────────
// Retire `embedding` / `embeddingModel` des chunks title, embed, audio, video
// et viewport : retour au keyword seul. Balayage paginé (100 docs /
// transaction), patch, puis chaînage au scheduler.
//
// Lancer avec : `npx convex run migrations:stripExcludedEmbeddings '{}'`
// Idempotent : relançable sans risque (no-op une fois purgé).

export const stripExcludedEmbeddings = internalAction({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    canvasId: v.optional(v.id("canvases")),
  },
  returns: v.object({
    done: v.boolean(),
    processed: v.number(),
    stripped: v.number(),
    continueCursor: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    done: boolean;
    processed: number;
    stripped: number;
    continueCursor: string | undefined;
  }> => {
    const numItems = Math.min(Math.max(args.limit ?? PAGE_SIZE, 1), PAGE_SIZE);
    const slice = await ctx.runQuery(
      internal.wrappers.searchableChunkWrappers.listChunkPage,
      {
        paginationOpts: { numItems, cursor: args.cursor ?? null },
        canvasId: args.canvasId,
      },
    );

    const excluded = slice.page.filter(
      (chunk) =>
        !isNodeTypeEmbedded(chunk.nodeType) && chunk.hasEmbedding,
    );

    let stripped = 0;
    if (excluded.length > 0) {
      await ctx.runMutation(
        internal.wrappers.searchableChunkWrappers.stripChunkEmbeddings,
        {
          ids: excluded.map((chunk) => chunk._id),
        },
      );
      stripped = excluded.length;
    }

    console.log("[migrations] stripExcludedEmbeddings:page", {
      processed: slice.page.length,
      stripped,
      isDone: slice.isDone,
    });

    const continueCursor: string | undefined = slice.isDone
      ? undefined
      : slice.continueCursor;
    if (!slice.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.stripExcludedEmbeddings,
        {
          cursor: slice.continueCursor,
          limit: numItems,
          canvasId: args.canvasId,
        },
      );
    } else {
      console.log("[migrations] stripExcludedEmbeddings:complete");
    }

    return {
      done: slice.isDone,
      processed: slice.page.length,
      stripped,
      continueCursor,
    };
  },
});
