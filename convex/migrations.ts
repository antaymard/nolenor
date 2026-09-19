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
// audio, video, viewport, frame, app) ne sont jamais vectorisés : leurs
// chunks restent keyword seuls.
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
// Retire `embedding` / `embeddingModel` des chunks title, embed, audio, video,
// viewport, frame et app : retour au keyword seul. Balayage paginé (100 docs /
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
      (chunk) => !isNodeTypeEmbedded(chunk.nodeType) && chunk.hasEmbedding,
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

// ── Backfill des résumés Parallel sur les liens ────────────────────────────
// Les LinkNodes créés avant l'indexation par résumé portent un chunk réduit à
// `href | domain`. On rejoue `rebuildChunks` sur eux : la branche `link` va
// alors interroger Parallel, et le chunk repart avec titre, description OG et
// résumé de page — donc avec un embedding qui porte enfin quelque chose.
//
// Balayage des CHUNKS et non des nodeDatas : `nodeDatas` n'a pas d'index sur
// `type`, et en ajouter un pour une migration jouée une fois ne se justifie
// pas. Balayer les chunks cible d'ailleurs mieux — un LinkNode sans chunk est
// un lien sans `href`, qui n'a aucun résumé à aller chercher.
//
// Lancer avec : `npx convex run migrations:backfillLinkSummaries '{}'`
// Ou sur un seul canvas d'abord :
// `npx convex run migrations:backfillLinkSummaries '{"canvasId":"<id>"}'`
//
// Idempotent : la branche `link` réutilise le résumé déjà stocké tant que
// l'URL n'a pas changé, donc un relancement ne repaye pas Parallel.

// Plus petit que `PAGE_SIZE` : `rebuildChunksBatch` boucle séquentiellement, et
// une page de 100 liens enchaînerait 100 extractions Parallel dans une seule
// action. 25 reste confortablement sous la limite de temps d'une action.
// const LINK_BACKFILL_PAGE_SIZE = 25;

// export const backfillLinkSummaries = internalAction({
//   args: {
//     cursor: v.optional(v.string()),
//     limit: v.optional(v.number()),
//     canvasId: v.optional(v.id("canvases")),
//   },
//   returns: v.object({
//     done: v.boolean(),
//     processed: v.number(),
//     rebuilt: v.number(),
//     continueCursor: v.optional(v.string()),
//   }),
//   // Annotation explicite : l'action se re-schedule elle-même via `internal`
//   // (même fichier), sans quoi l'inférence TS boucle (cf. guidelines).
//   handler: async (
//     ctx,
//     args,
//   ): Promise<{
//     done: boolean;
//     processed: number;
//     rebuilt: number;
//     continueCursor: string | undefined;
//   }> => {
//     const numItems = Math.min(
//       Math.max(args.limit ?? LINK_BACKFILL_PAGE_SIZE, 1),
//       LINK_BACKFILL_PAGE_SIZE,
//     );
//     const slice = await ctx.runQuery(
//       internal.wrappers.searchableChunkWrappers.listChunkPage,
//       {
//         paginationOpts: { numItems, cursor: args.cursor ?? null },
//         canvasId: args.canvasId,
//       },
//     );

//     const nodeDataIds = [
//       ...new Set(
//         slice.page
//           .filter((chunk) => chunk.nodeType === "link")
//           .map((chunk) => chunk.nodeDataId),
//       ),
//     ];

//     if (nodeDataIds.length > 0) {
//       // `runAction` et non `runMutation` : `migrations.ts` tourne dans le
//       // runtime V8 par défaut, `chunkBuilder.ts` est `"use node"`. C'est le cas
//       // documenté où appeler une action depuis une action est légitime.
//       //
//       // Awaité, et non planifié : cela sérialise les appels Parallel au lieu
//       // d'empiler des batches concurrents. Ni workpool ni retrier ne sont
//       // installés dans ce projet pour lisser une rafale.
//       await ctx.runAction(internal.searchable.chunkBuilder.rebuildChunksBatch, {
//         nodeDataIds,
//       });
//     }

//     console.log("[migrations] backfillLinkSummaries:page", {
//       processed: slice.page.length,
//       rebuilt: nodeDataIds.length,
//       isDone: slice.isDone,
//     });

//     const continueCursor: string | undefined = slice.isDone
//       ? undefined
//       : slice.continueCursor;
//     if (!slice.isDone) {
//       await ctx.scheduler.runAfter(
//         0,
//         internal.migrations.backfillLinkSummaries,
//         {
//           cursor: slice.continueCursor,
//           limit: numItems,
//           canvasId: args.canvasId,
//         },
//       );
//     } else {
//       console.log("[migrations] backfillLinkSummaries:complete");
//     }

//     return {
//       done: slice.isDone,
//       processed: slice.page.length,
//       rebuilt: nodeDataIds.length,
//       continueCursor,
//     };
//   },
// });
