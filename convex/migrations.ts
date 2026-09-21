import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isNodeTypeEmbedded } from "./config/nodeConfig";
import { buildEmbeddingText, embedDocuments } from "./lib/voyage";
import * as NodeDataModels from "./models/nodeDataModels";

// ── Backfill des embeddings Voyage-4 ────────────────────────────────────────
// Chunks créés avant l'indexation vectorielle (ou dont l'embed a échoué) :
// `embedding` absent ou tagué d'un autre modèle. Balayage paginé (100 docs /
// transaction), embed via Voyage, patch, puis chaînage au scheduler.
//
// Les types exclus via `nodeConfig` (`search.embed: false` : title, audio,
// video, frame, app) ne sont jamais vectorisés : leurs chunks restent
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
// Retire `embedding` / `embeddingModel` des chunks title, audio, video,
// frame et app : retour au keyword seul. Balayage paginé (100 docs /
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

// ── Purge des nodes `viewport` (repères de navigation) ─────────────────────
// Le type `viewport` est retiré du produit. Rien à migrer : ces nodes ne
// portaient qu'un cadrage de caméra (`{cx, cy, zoom}`), il n'existe aucun
// autre type où le reverser. On les efface donc, partout où
// `nodeTypeValidator` est stocké — `nodes`, `nodeDatas`, `nodeDataVersions`,
// `searchableChunks`. Les quatre tables comptent : un `push` du schéma sans
// le littéral `"viewport"` échoue tant qu'UN document le porte encore, et les
// versions survivent volontairement à leur nodeData (corbeille de fait), donc
// nettoyer les seuls `nodes` ne suffirait pas.
//
// ORDRE DE DÉPLOIEMENT — deux passes, dans cet ordre :
//   1. déployer ce fichier avec `"viewport"` TOUJOURS dans l'enum, puis
//      `npx convex run migrations:purgeViewportNodes '{}'` (attendre
//      `done: true`, ou relancer tant qu'il est à false) ;
//   2. déployer le retrait de l'enum et du reste du code.
//
// Idempotent : relançable sans risque, no-op une fois la base propre.

// Comparaison via une constante typée `string` et non le littéral : une fois
// `"viewport"` sorti de `nodeTypeValidator`, `node.type === "viewport"` ne
// compile plus (TS refuse la comparaison avec une valeur hors union). Le type
// a disparu du code mais pas encore de la base — c'est précisément ce que
// cette migration vient corriger, elle doit donc survivre à l'étape 2.
const LEGACY_VIEWPORT_TYPE: string = "viewport";

// Plus petit que `PAGE_SIZE` : chaque `viewport` rencontré déclenche une
// cascade (versions, chunks, mémoires, refs R2) dans la MÊME transaction.
// 50 laisse de la marge sous les limites d'écriture même sur une page qui
// n'aurait que des repères.
const VIEWPORT_PURGE_PAGE_SIZE = 50;

/**
 * Les tables balayées, dans l'ordre où la migration les enchaîne.
 *
 * `nodes` d'abord : sa cascade emporte déjà le nodeData, ses versions et ses
 * chunks. Les trois passes suivantes ne ramassent donc que les orphelins —
 * un nodeData qu'aucun node ne référence, des versions ou des chunks laissés
 * par une suppression antérieure à cette migration.
 */
const viewportPurgePhaseValidator = v.union(
  v.literal("nodes"),
  v.literal("nodeDatas"),
  v.literal("nodeDataVersions"),
  v.literal("searchableChunks"),
);

const VIEWPORT_PURGE_PHASES = [
  "nodes",
  "nodeDatas",
  "nodeDataVersions",
  "searchableChunks",
] as const;

type ViewportPurgePhase = (typeof VIEWPORT_PURGE_PHASES)[number];

type ViewportPurgeResult = {
  done: boolean;
  phase: ViewportPurgePhase;
  processed: number;
  deleted: number;
  continueCursor: string | undefined;
};

export const purgeViewportNodes = internalMutation({
  args: {
    phase: v.optional(viewportPurgePhaseValidator),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    done: v.boolean(),
    phase: viewportPurgePhaseValidator,
    processed: v.number(),
    deleted: v.number(),
    continueCursor: v.optional(v.string()),
  }),
  // Annotation explicite : la mutation se re-schedule elle-même via `internal`
  // (même fichier), sans quoi l'inférence TS boucle (cf. guidelines).
  handler: async (ctx, args): Promise<ViewportPurgeResult> => {
    const phase = args.phase ?? "nodes";
    const numItems = Math.min(
      Math.max(args.limit ?? VIEWPORT_PURGE_PAGE_SIZE, 1),
      VIEWPORT_PURGE_PAGE_SIZE,
    );
    const paginationOpts = { numItems, cursor: args.cursor ?? null };

    let processed = 0;
    let deleted = 0;
    let isDone = true;
    let continueCursor: string | undefined;

    if (phase === "nodes") {
      // Balayage de toute la table : `nodes` n'a pas d'index sur `type`, et en
      // ajouter un pour une migration jouée une fois ne se justifie pas (même
      // raisonnement que `backfillLinkSummaries`). Les nodes à la corbeille
      // sont inclus — ils portent eux aussi `type: "viewport"`.
      const slice = await ctx.db.query("nodes").paginate(paginationOpts);
      processed = slice.page.length;
      isDone = slice.isDone;
      continueCursor = slice.isDone ? undefined : slice.continueCursor;

      const victims = slice.page.filter(
        (node) => (node.type as string) === LEGACY_VIEWPORT_TYPE,
      );

      // Les edges désignent les nodes par leur llmid, pas par leur `_id` : on
      // les relit par canvas. Groupé pour ne scanner chaque canvas qu'une
      // fois, même quand la page porte plusieurs repères du même.
      const idsByCanvas = new Map<Id<"canvases">, Set<string>>();
      for (const node of victims) {
        const existing = idsByCanvas.get(node.canvasId);
        if (existing) existing.add(node.id);
        else idsByCanvas.set(node.canvasId, new Set([node.id]));
      }

      for (const [canvasId, nodeIds] of idsByCanvas) {
        const edges = await ctx.db
          .query("edges")
          .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
          .collect();
        for (const edge of edges) {
          if (nodeIds.has(edge.source) || nodeIds.has(edge.target)) {
            await ctx.db.delete(edge._id);
          }
        }
      }

      for (const node of victims) {
        // `purgeVersions: true` et non le défaut : le chemin normal prend un
        // snapshot final (`trigger: "delete"`) qui RECRÉERAIT une ligne
        // `nodeDataVersions` en `nodeType: "viewport"` — soit exactement le
        // document que le schéma va refuser. Une fonctionnalité retirée n'a
        // de toute façon pas de corbeille à alimenter.
        await NodeDataModels.deleteNodeDataWithCascade(ctx, {
          nodeDataId: node.nodeDataId,
          purgeVersions: true,
        });
        await ctx.db.delete(node._id);
        deleted += 1;
      }
    } else if (phase === "nodeDatas") {
      const slice = await ctx.db.query("nodeDatas").paginate(paginationOpts);
      processed = slice.page.length;
      isDone = slice.isDone;
      continueCursor = slice.isDone ? undefined : slice.continueCursor;

      for (const nodeData of slice.page) {
        if ((nodeData.type as string) !== LEGACY_VIEWPORT_TYPE) continue;
        await NodeDataModels.deleteNodeDataWithCascade(ctx, {
          nodeDataId: nodeData._id,
          purgeVersions: true,
        });
        deleted += 1;
      }
    } else if (phase === "nodeDataVersions") {
      const slice = await ctx.db
        .query("nodeDataVersions")
        .paginate(paginationOpts);
      processed = slice.page.length;
      isDone = slice.isDone;
      continueCursor = slice.isDone ? undefined : slice.continueCursor;

      for (const version of slice.page) {
        if ((version.nodeType as string) !== LEGACY_VIEWPORT_TYPE) continue;
        await ctx.db.delete(version._id);
        deleted += 1;
      }
    } else {
      const slice = await ctx.db
        .query("searchableChunks")
        .paginate(paginationOpts);
      processed = slice.page.length;
      isDone = slice.isDone;
      continueCursor = slice.isDone ? undefined : slice.continueCursor;

      for (const chunk of slice.page) {
        if ((chunk.nodeType as string) !== LEGACY_VIEWPORT_TYPE) continue;
        await ctx.db.delete(chunk._id);
        deleted += 1;
      }
    }

    console.log("[migrations] purgeViewportNodes:page", {
      phase,
      processed,
      deleted,
      isDone,
    });

    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.purgeViewportNodes, {
        phase,
        cursor: continueCursor,
        limit: numItems,
      });
      return { done: false, phase, processed, deleted, continueCursor };
    }

    // Phase terminée : on enchaîne sur la suivante, curseur remis à zéro. Le
    // `done: true` final n'est rendu qu'après la dernière.
    const nextPhase = VIEWPORT_PURGE_PHASES[
      VIEWPORT_PURGE_PHASES.indexOf(phase) + 1
    ] as ViewportPurgePhase | undefined;

    if (nextPhase) {
      await ctx.scheduler.runAfter(0, internal.migrations.purgeViewportNodes, {
        phase: nextPhase,
        limit: numItems,
      });
      return { done: false, phase, processed, deleted, continueCursor };
    }

    console.log("[migrations] purgeViewportNodes:complete");
    return { done: true, phase, processed, deleted, continueCursor };
  },
});
