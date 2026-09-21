import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { isNodeTypeEmbedded } from "./config/nodeConfig";
import { extractIframeSrc } from "./lib/embedUrl";
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

// ── Fusion du node `embed` dans `link` (étape 2/3) ──────────────────────────
// Le node `embed` disparaît au profit d'une variante `embed` du node `link` :
// même contenu, rendu dans une iframe, lu depuis le seul `link.href`.
//
// Cette migration est l'étape 2 sur 3, et l'ordre n'est pas négociable :
//
//   1. (poussé) La variante `embed` de `link` existe et s'écrit. `"embed"`
//      reste dans l'enum des types, EmbedNode rend encore les nodes existants.
//   2. (ici) Réécriture des documents : `type`/`nodeType` "embed" → "link",
//      `values.embed` → `values.link`, variante reportée.
//   3. Retrait de `"embed"` de `nodeTypeValues` et suppression d'EmbedNode.
//
// L'étape 3 ne peut PAS précéder celle-ci : la validation de schéma Convex
// refuse au déploiement un document dont la valeur stockée est absente du
// validateur. Le même piège est documenté sur `searchableChunks.nodeId`.
//
// QUATRE champs stockés portent l'enum, et il suffit d'une ligne oubliée dans
// n'importe lequel pour bloquer l'étape 3 :
//   - `nodeDatas.type`            (+ `values.embed` à convertir)
//   - `nodes.type`               (+ `variant` à reporter)
//   - `searchableChunks.nodeType`
//   - `nodeDataVersions.nodeType` (+ `values.embed` à convertir)
//
// D'où un balayage par table, et non une descente depuis les nodeDatas : les
// nodes à la corbeille sont des lignes comme les autres, et les
// `nodeDataVersions` survivent volontairement à la suppression de leur
// nodeData (cf. le commentaire de leur table) — elles seraient donc invisibles
// depuis un parcours des nodeDatas vivants.
//
// Les chunks ne sont PAS reconstruits : leur `nodeType` est basculé sur place.
// Leur texte (`type | url | domain`) reste exactement ce qu'il était, donc la
// recherche keyword ne bouge pas, et rien n'appelle Parallel — une
// reconstruction facturerait une extraction par node. Pour leur donner en plus
// résumé de page et embedding, jouer ensuite, et séparément,
// `backfillEmbeddings` (vectorise les chunks `link` qui n'ont pas d'embedding).
//
// Ni checkpoint de version ni `updatedAt` : la migration écrit par `ctx.db`
// plutôt que par `NodeDataModels.updateValues`, dont les effets de bord
// (snapshot pré-write, réconciliation R2, replanification de l'indexation) ne
// sont pas souhaitables ici — on ne veut pas 300 versions "system" datées du
// jour de la migration.
//
// Lancer, dans cet ordre (chaque phase enchaîne la suivante d'elle-même) :
//   npx convex run migrations:migrateEmbedNodesToLink '{"dryRun":true}'
//   npx convex run migrations:migrateEmbedNodesToLink '{}'
//
// `dryRun` compte sans écrire : c'est aussi le moyen de vérifier qu'il ne
// reste plus rien avant de pousser l'étape 3 (les quatre phases doivent
// rapporter `migrated: 0`).
//
// Idempotente : un second passage ne trouve plus de ligne à convertir.
// À SUPPRIMER avec l'étape 3 — elle ne compilera plus une fois `"embed"` hors
// de l'enum.

const EMBED_MIGRATION_PHASES = [
  "nodeDatas",
  "nodes",
  "chunks",
  "versions",
] as const;

type EmbedMigrationPhase = (typeof EMBED_MIGRATION_PHASES)[number];

const embedMigrationPhaseValidator = v.union(
  v.literal("nodeDatas"),
  v.literal("nodes"),
  v.literal("chunks"),
  v.literal("versions"),
);

/**
 * La variante `link` qui reproduit l'apparence d'une variante `embed`.
 *
 * L'ancien type avait `preview` (l'iframe) pour variante par défaut et `title`
 * (le bandeau) en second. Une ligne sans variante est donc une iframe : les
 * nodes créés avant l'existence des variantes n'en portent pas, et
 * `withDefaultVariant` aurait posé `preview`. Toute valeur inattendue retombe
 * sur `embed`, la seule qui préserve l'apparence par défaut.
 *
 * Les dimensions ne sont pas touchées : les gabarits des deux variantes
 * concernées sont identiques (400×352 et 250×40), et un node redimensionné à
 * la main doit garder sa taille.
 */
function linkVariantForEmbedVariant(variant: string | undefined): string {
  return variant === "title" ? "default" : "embed";
}

/**
 * `values.embed` → `values.link`.
 *
 * `href` prend `embed.url`, l'entrée d'origine de l'utilisateur, et non
 * `embed.embedUrl` : c'est l'URL de page, celle dont `deriveEmbedUrl` sait
 * retrouver la forme embarquable au rendu, celle qui a un sens dans les deux
 * autres variantes, et celle que l'indexation peut résumer.
 *
 * Deux exceptions, dans cet ordre :
 *   - `embed.url` stockait l'entrée BRUTE, donc parfois un snippet `<iframe>`
 *     entier. On le réduit à son `src`, sans quoi `href` contiendrait du HTML.
 *   - `embed.url` vide (écriture d'agent qui n'a rempli qu'`embedUrl`) : on
 *     retombe sur `embedUrl`.
 *
 * `embed.type` n'est pas reporté : il ne servait qu'à l'ancien chunk et se
 * redéduit de l'URL. `pageTitle` reste vide quand le node n'avait pas de titre
 * — le node affiche alors son URL, comme n'importe quel lien sans titre.
 *
 * À N'APPELER que sur un document dont le `type` vaut encore "embed" : sur des
 * values déjà converties, elle écraserait le `link` existant par un lien vide.
 * L'idempotence de la migration ne vient pas d'ici mais du filtre sur `type`,
 * qui ne resélectionne pas une ligne déjà passée.
 */
function embedValuesToLinkValues(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const embed = (values.embed ?? {}) as {
    url?: unknown;
    embedUrl?: unknown;
    title?: unknown;
  };

  const readString = (value: unknown): string =>
    typeof value === "string" ? value.trim() : "";

  const rawUrl = readString(embed.url);
  const embedUrl = readString(embed.embedUrl);
  const href = extractIframeSrc(rawUrl) ?? (rawUrl || embedUrl);

  // `embed` retiré et `link` ajouté ; les autres clés sont recopiées telles
  // quelles — un node peut en porter que le schéma ne décrit plus.
  const { embed: _dropped, ...rest } = values;
  return {
    ...rest,
    link: { href, pageTitle: readString(embed.title) },
  };
}

export const migrateEmbedNodesToLink = internalMutation({
  args: {
    phase: v.optional(embedMigrationPhaseValidator),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    phase: embedMigrationPhaseValidator,
    done: v.boolean(),
    scanned: v.number(),
    migrated: v.number(),
    continueCursor: v.optional(v.string()),
  }),
  // Annotation explicite : la mutation se re-planifie via `internal` (même
  // fichier), sans quoi l'inférence TS boucle (cf. guidelines).
  handler: async (
    ctx,
    args,
  ): Promise<{
    phase: EmbedMigrationPhase;
    done: boolean;
    scanned: number;
    migrated: number;
    continueCursor: string | undefined;
  }> => {
    const phase: EmbedMigrationPhase = args.phase ?? "nodeDatas";
    const dryRun = args.dryRun ?? false;
    const numItems = Math.min(Math.max(args.limit ?? PAGE_SIZE, 1), PAGE_SIZE);
    const paginationOpts = { numItems, cursor: args.cursor ?? null };

    let scanned = 0;
    let migrated = 0;
    let isDone = true;
    let pageCursor = "";

    // Balayage de table entière : aucun de ces champs n'est indexé, et ajouter
    // un index pour une migration jouée une fois ne se justifie pas (même
    // arbitrage que `backfillLinkSummaries`).
    if (phase === "nodeDatas") {
      const slice = await ctx.db.query("nodeDatas").paginate(paginationOpts);
      const targets = slice.page.filter((doc) => doc.type === "embed");
      if (!dryRun) {
        for (const doc of targets) {
          await ctx.db.patch("nodeDatas", doc._id, {
            type: "link",
            values: embedValuesToLinkValues(doc.values),
          });
        }
      }
      scanned = slice.page.length;
      migrated = targets.length;
      isDone = slice.isDone;
      pageCursor = slice.continueCursor;
    } else if (phase === "nodes") {
      const slice = await ctx.db.query("nodes").paginate(paginationOpts);
      const targets = slice.page.filter((doc) => doc.type === "embed");
      if (!dryRun) {
        for (const doc of targets) {
          await ctx.db.patch("nodes", doc._id, {
            type: "link",
            variant: linkVariantForEmbedVariant(doc.variant),
          });
        }
      }
      scanned = slice.page.length;
      migrated = targets.length;
      isDone = slice.isDone;
      pageCursor = slice.continueCursor;
    } else if (phase === "chunks") {
      const slice = await ctx.db
        .query("searchableChunks")
        .paginate(paginationOpts);
      const targets = slice.page.filter((doc) => doc.nodeType === "embed");
      if (!dryRun) {
        for (const doc of targets) {
          await ctx.db.patch("searchableChunks", doc._id, {
            nodeType: "link",
          });
        }
      }
      scanned = slice.page.length;
      migrated = targets.length;
      isDone = slice.isDone;
      pageCursor = slice.continueCursor;
    } else {
      const slice = await ctx.db
        .query("nodeDataVersions")
        .paginate(paginationOpts);
      const targets = slice.page.filter((doc) => doc.nodeType === "embed");
      if (!dryRun) {
        for (const doc of targets) {
          await ctx.db.patch("nodeDataVersions", doc._id, {
            nodeType: "link",
            // Converti aussi : restaurer un snapshot non converti réécrirait
            // un `values.embed` sur un node devenu `link`, que plus rien ne
            // sait lire — le node paraîtrait vide.
            values: embedValuesToLinkValues(doc.values),
          });
        }
      }
      scanned = slice.page.length;
      migrated = targets.length;
      isDone = slice.isDone;
      pageCursor = slice.continueCursor;
    }

    console.log("[migrations] migrateEmbedNodesToLink:page", {
      phase,
      dryRun,
      scanned,
      migrated,
      isDone,
    });

    const continueCursor: string | undefined = isDone ? undefined : pageCursor;

    if (!isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.migrateEmbedNodesToLink,
        { phase, cursor: pageCursor, limit: numItems, dryRun },
      );
    } else {
      // Phase terminée : enchaîner la suivante, ou clore. Les quatre phases
      // s'exécutent donc sur un seul appel, et l'ordre entre elles est
      // indifférent — chaque table est indépendante des autres.
      const nextPhase = EMBED_MIGRATION_PHASES[
        EMBED_MIGRATION_PHASES.indexOf(phase) + 1
      ] as EmbedMigrationPhase | undefined;

      if (nextPhase) {
        await ctx.scheduler.runAfter(
          0,
          internal.migrations.migrateEmbedNodesToLink,
          { phase: nextPhase, limit: numItems, dryRun },
        );
      } else {
        console.log("[migrations] migrateEmbedNodesToLink:complete", { dryRun });
      }
    }

    return { phase, done: isDone, scanned, migrated, continueCursor };
  },
});
