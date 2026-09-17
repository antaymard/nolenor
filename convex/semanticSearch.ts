import { v } from "convex/values";
import {
  action,
  internalAction,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { nodeTypeValidator, type NodeType } from "./schemas/nodeTypeSchema";
import {
  fusedHitValidator,
  groupedSearchResultValidator,
  searchModeValidator,
  type FusedHit,
  type SearchModeValue,
} from "./schemas/searchableChunksSchema";
import { embedQuery } from "./lib/voyage";
import {
  containsExcludedTerm,
  extractExcludedTerms,
  toEmbeddingQuery,
} from "./lib/embeddingQuery";
import { fuseRrf, type RankedInput } from "./lib/reciprocalRankFusion";
import { stripLoneSurrogates } from "./lib/textSanitize";
import { RANKING } from "./lib/searchScoring";
import { buildChunkSnippets } from "./searchableChunks";

// ── Recherche sémantique & hybride ─────────────────────────────────────────
// `ctx.vectorSearch` n'existe qu'en action : toute la partie vectorielle vit
// ici. Le mode keyword pur reste servi par la query réactive
// `api.searchableChunks.search` (front) et le tool `search_canvas` (agent).
// Le filtre vectoriel est `canvasId` uniquement (pas de AND inter-champs
// côté Convex) : `nodeTypes` / `nodeIds` se filtrent en TS après hydratation
// (cf. `hydrateVectorHits` dans les models).

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const VECTOR_MAX_RESULTS = 256;
const MAX_SNIPPETS_PER_NODE = 5;

// Seuil cosinus Voyage (`_score` ∈ [-1, 1]) : en-dessous, le candidat est
// écarté. Sans lui, le vector search renvoie toujours ses top-K voisins,
// même tous hors-sujet. Calibré le 2026-09-17 sur logs `[semantic-score]` :
// requête hors-sujet (crêpes) best=0.36, requête pertinente (mémoire
// épisodique) best=0.45 → seuil à 0.40. À réajuster si la distribution dérive
// (modèle, langue, corpus). Le fallback `relaxed` garantit qu'un seuil trop
// haut dégrade en signalé, jamais en vide silencieux.
const VECTOR_SCORE_THRESHOLD = 0.4;

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
}

/** Sur-échantillonne le vector search : les post-filtres TS écartent des hits. */
function vectorScanLimit(effectiveLimit: number): number {
  return Math.min(Math.max(effectiveLimit * 5, 50), VECTOR_MAX_RESULTS);
}

function chunkKey(
  nodeDataId: string,
  chunkType: string,
  order: number,
): string {
  return `${nodeDataId}:${chunkType}:${order}`;
}

// ── Cœur sémantique (helper partagé, pas de cycle same-file) ───────────────

type SemanticBranchResult = {
  hits: FusedHit[];
  scanned: number;
  // Tout a été filtré par le seuil mais des candidats existaient :
  // best-effort signalé (miroir du `relaxed` keyword).
  relaxed: boolean;
};

async function semanticCore(
  ctx: ActionCtx,
  {
    canvasId,
    query,
    nodeIds,
    nodeTypes,
    limit,
    agentReadableOnly,
  }: {
    canvasId: Id<"canvases">;
    query: string;
    nodeIds?: string[];
    nodeTypes?: NodeType[];
    limit: number;
    agentReadableOnly: boolean;
  },
): Promise<SemanticBranchResult> {
  const vector = await embedQuery(toEmbeddingQuery(query));
  const excludedTerms = extractExcludedTerms(query);
  const results = await ctx.vectorSearch(
    "searchableChunks",
    "by_embedding",
    {
      vector,
      limit: vectorScanLimit(limit),
      filter: (q) => q.eq("canvasId", canvasId),
    },
  );
  // Les exclusions `-mot` n'ont pas de sens pour un embedding : on les
  // applique en post-filtre (la branche keyword les gère nativement).
  const hydrated = await ctx.runQuery(
    internal.wrappers.searchableChunkWrappers.hydrateVectorHits,
    {
      canvasId,
      hits: results.map((hit) => ({ id: hit._id, score: hit._score })),
      nodeIds,
      nodeTypes,
      agentReadableOnly,
    },
  );
  const kept =
    excludedTerms.length > 0
      ? hydrated.filter(
          (hit) => !containsExcludedTerm(hit.text, excludedTerms),
        )
      : hydrated;
  const aboveThreshold = kept.filter(
    (hit) => hit.score >= VECTOR_SCORE_THRESHOLD,
  );
  // TEMP calibration : distribution des scores pour fixer le seuil sur du
  // réel (requête tronquée, scores best/worst, comptages). À retirer une fois
  // VECTOR_SCORE_THRESHOLD calibré.
  console.log(
    "[semantic-score]",
    JSON.stringify({
      q: query.slice(0, 80),
      scanned: results.length,
      hydrated: hydrated.length,
      aboveThreshold: aboveThreshold.length,
      best: hydrated[0]?.score ?? null,
      worst: hydrated[hydrated.length - 1]?.score ?? null,
    }),
  );
  // Seuil trop strict mais candidats existants : on rend le best-effort en le
  // signalant plutôt qu'un vide. Zéro candidat → `no_results` en aval.
  if (aboveThreshold.length === 0 && kept.length > 0) {
    return {
      hits: kept.map((hit) => ({ ...hit, sources: ["semantic" as const] })),
      scanned: results.length,
      relaxed: true,
    };
  }
  return {
    hits: aboveThreshold.map((hit) => ({
      ...hit,
      sources: ["semantic" as const],
    })),
    scanned: results.length,
    relaxed: false,
  };
}

// ── Actions internes (agent) ───────────────────────────────────────────────

type BranchHit = Omit<FusedHit, "score" | "sources">;

const baseSearchArgsValidator = {
  canvasId: v.id("canvases"),
  nodeIds: v.optional(v.array(v.string())),
  nodeTypes: v.optional(v.array(nodeTypeValidator)),
  limit: v.optional(v.number()),
  agentReadableOnly: v.optional(v.boolean()),
};

// Chaque branche reçoit sa propre formulation : syntaxe opérateurs côté
// keyword, phrases affirmatives côté sémantique. Au moins une des deux doit
// être fournie (validé côté tool) ; les deux → fusion hybride RRF.
const hybridArgsValidator = {
  ...baseSearchArgsValidator,
  keywordQuery: v.optional(v.string()),
  semanticQuery: v.optional(v.string()),
};

const hybridReturnsValidator = v.object({
  hits: v.array(fusedHitValidator),
  mode: searchModeValidator,
  scanned: v.number(),
  limit: v.number(),
  truncated: v.boolean(),
  relaxed: v.boolean(),
  terms: v.array(v.string()),
  /** La branche sémantique a échoué : repli keyword seul. */
  degraded: v.optional(v.boolean()),
});

type HybridResult = {
  hits: FusedHit[];
  mode: SearchModeValue;
  scanned: number;
  limit: number;
  truncated: boolean;
  relaxed: boolean;
  terms: string[];
  degraded?: boolean;
};

export const runSemanticSearch = internalAction({
  args: { ...baseSearchArgsValidator, query: v.string() },
  returns: hybridReturnsValidator,
  // Annotation explicite : le module s'auto-référence via `internal`
  // (cf. guidelines sur la circularité TS).
  handler: async (ctx, args): Promise<HybridResult> => {
    const effectiveLimit = clampLimit(args.limit);
    const { hits, scanned, relaxed } = await semanticCore(ctx, {
      canvasId: args.canvasId,
      query: args.query,
      nodeIds: args.nodeIds,
      nodeTypes: args.nodeTypes,
      limit: effectiveLimit,
      agentReadableOnly: args.agentReadableOnly === true,
    });
    const selected = hits.slice(0, effectiveLimit);
    return {
      hits: selected.map((hit) => ({ ...hit, score: hit.score })),
      mode: "semantic",
      scanned,
      limit: effectiveLimit,
      truncated:
        hits.length > effectiveLimit ||
        scanned >= vectorScanLimit(effectiveLimit),
      relaxed,
      terms: [],
      degraded: false,
    };
  },
});

export const runHybridSearch = internalAction({
  args: {
    ...hybridArgsValidator,
    useKeyword: v.optional(v.boolean()),
    useSemantic: v.optional(v.boolean()),
  },
  returns: hybridReturnsValidator,
  handler: async (ctx, args): Promise<HybridResult> => {
    const effectiveLimit = clampLimit(args.limit);
    const keywordQuery = args.keywordQuery?.trim() ?? "";
    const semanticQuery = args.semanticQuery?.trim() ?? "";
    const useKeyword = args.useKeyword !== false && keywordQuery.length > 0;
    const useSemantic = args.useSemantic !== false && semanticQuery.length > 0;
    // Agent : filtre les types illisibles ; front : voit tout.
    const readableOnly = args.agentReadableOnly === true;
    const scanLimit = Math.min(effectiveLimit * 5, 250);

    const keywordResult = useKeyword
      ? await ctx.runQuery(
          internal.wrappers.searchableChunkWrappers.keywordSearch,
          {
            canvasId: args.canvasId,
            query: keywordQuery,
            nodeIds: args.nodeIds,
            nodeTypes: args.nodeTypes,
            limit: scanLimit,
          },
        )
      : null;

    // La branche sémantique ne doit jamais faire échouer la recherche :
    // repli keyword seul, signalé par `degraded`.
    let semanticResult: SemanticBranchResult | null = null;
    if (useSemantic) {
      try {
        semanticResult = await semanticCore(ctx, {
          canvasId: args.canvasId,
          query: semanticQuery,
          nodeIds: args.nodeIds,
          nodeTypes: args.nodeTypes,
          limit: effectiveLimit,
          agentReadableOnly: readableOnly,
        });
      } catch (error) {
        console.warn("[semanticSearch] runHybridSearch:semantic-failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const keywordInputs: RankedInput<BranchHit>[] = (keywordResult?.hits ?? []).map(
      (hit) => ({
        key: chunkKey(String(hit.nodeDataId), hit.chunkType, hit.order),
        hit: {
          nodeId: hit.nodeId,
          nodeDataId: hit.nodeDataId,
          nodeType: hit.nodeType,
          chunkType: hit.chunkType,
          order: hit.order,
          text: hit.text,
          title: hit.title,
          page: hit.page,
          sectionTitle: hit.sectionTitle,
        },
      }),
    );
    const semanticInputs: RankedInput<BranchHit>[] = (semanticResult?.hits ?? []).map(
      (hit) => ({
        key: chunkKey(String(hit.nodeDataId), hit.chunkType, hit.order),
        hit: {
          nodeId: hit.nodeId,
          nodeDataId: hit.nodeDataId,
          nodeType: hit.nodeType,
          chunkType: hit.chunkType,
          order: hit.order,
          text: hit.text,
          title: hit.title,
          page: hit.page,
          sectionTitle: hit.sectionTitle,
          imageUrl: hit.imageUrl,
        },
      }),
    );

    // URL d'aperçu : reprise de la branche sémantique par clé. Le score RRF
    // reste la référence de tri en hybride (échelles non mélangeables).
    const semanticByKey = new Map(
      (semanticResult?.hits ?? []).map((hit) => [
        chunkKey(String(hit.nodeDataId), hit.chunkType, hit.order),
        hit,
      ]),
    );
    const withImageUrl = (fused: FusedHit[]): FusedHit[] =>
      fused.map((hit) => ({
        ...hit,
        imageUrl:
          hit.imageUrl ??
          semanticByKey.get(
            chunkKey(String(hit.nodeDataId), hit.chunkType, hit.order),
          )?.imageUrl,
      }));

    let hits: FusedHit[];
    let mode: SearchModeValue;
    if (useKeyword && semanticResult) {
      hits = withImageUrl(
        fuseRrf(keywordInputs, semanticInputs).slice(0, effectiveLimit),
      );
      mode = "hybrid";
    } else if (useKeyword) {
      hits = keywordInputs.slice(0, effectiveLimit).map((entry) => ({
        ...entry.hit,
        score: 0,
        sources: ["keyword" as const],
      }));
      mode = "keyword";
    } else {
      hits = semanticInputs.slice(0, effectiveLimit).map((entry) => {
        const ref = semanticByKey.get(entry.key);
        return {
          ...entry.hit,
          score: ref?.score ?? 0,
          sources: ["semantic" as const],
        };
      });
      mode = "semantic";
    }

    const scanned =
      (keywordResult?.scanned ?? 0) + (semanticResult?.scanned ?? 0);
    return {
      hits,
      mode,
      scanned,
      limit: effectiveLimit,
      truncated:
        (keywordResult?.truncated ?? false) ||
        (semanticResult ? semanticResult.hits.length > effectiveLimit : false),
      relaxed:
        (keywordResult?.relaxed ?? false) ||
        (semanticResult?.relaxed ?? false),
      terms: keywordResult?.terms ?? [],
      degraded: useSemantic && !semanticResult,
    };
  },
});

// ── Action publique (front : modes semantic / hybrid) ──────────────────────
// Le mode keyword pur reste servi par la query réactive
// `api.searchableChunks.search` (non modifiée).

export const search = action({
  args: {
    query: v.string(),
    canvasId: v.id("canvases"),
    nodeTypes: v.optional(v.array(nodeTypeValidator)),
    mode: v.optional(v.union(v.literal("semantic"), v.literal("hybrid"))),
  },
  returns: v.object({
    results: v.array(groupedSearchResultValidator),
    relaxed: v.boolean(),
    terms: v.array(v.string()),
    mode: searchModeValidator,
    degraded: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal.wrappers.searchableChunkWrappers.checkCanvasAccess,
      { canvasId: args.canvasId },
    );
    const mode = args.mode ?? "hybrid";

    // Pas d'embedding pour une requête trop courte (même garde que le tool).
    if (args.query.trim().length < 2) {
      return {
        results: [],
        relaxed: false,
        terms: [],
        mode,
        degraded: false,
      };
    }

    const result: HybridResult =
      mode === "semantic"
        ? await ctx.runAction(internal.semanticSearch.runSemanticSearch, {
            canvasId: args.canvasId,
            query: args.query,
            nodeTypes: args.nodeTypes,
            limit: RANKING.MAX_RESULTS,
            agentReadableOnly: false,
          })
        : await ctx.runAction(internal.semanticSearch.runHybridSearch, {
            canvasId: args.canvasId,
            keywordQuery: args.query,
            semanticQuery: args.query,
            nodeTypes: args.nodeTypes,
            limit: RANKING.MAX_RESULTS,
            useKeyword: true,
            useSemantic: true,
            agentReadableOnly: false,
          });

    // Regroupés par node, triés par meilleur score (RRF ou cosinus).
    const groupedByNode = new Map<string, FusedHit[]>();
    for (const hit of result.hits) {
      const existing = groupedByNode.get(String(hit.nodeDataId));
      if (existing) existing.push(hit);
      else groupedByNode.set(String(hit.nodeDataId), [hit]);
    }

    const results = Array.from(groupedByNode.values())
      .map((nodeHits) => {
        const first = nodeHits[0]!;
        const bestScore = Math.max(...nodeHits.map((hit) => hit.score));
        const images = Array.from(
          new Map(
            nodeHits.flatMap((hit) =>
              hit.imageUrl
                ? [
                    [
                      hit.imageUrl,
                      { imageUrl: hit.imageUrl, page: hit.page },
                    ] as const,
                  ]
                : [],
            ),
          ).values(),
        );
        return {
          result: {
            type: first.nodeType,
            nodeId: first.nodeId,
            nodeDataId: first.nodeDataId,
            title: first.title,
            images,
            snippets: nodeHits
              .flatMap((hit) =>
                buildChunkSnippets(hit.text, result.terms).map((match) => ({
                  snippet: stripLoneSurrogates(match.snippet),
                  chunkType: hit.chunkType,
                  order: hit.order,
                  page: hit.page,
                  imageUrl: hit.imageUrl,
                  matchStart: match.matchStart,
                  matchEnd: match.matchEnd,
                })),
              )
              .slice(0, MAX_SNIPPETS_PER_NODE),
          },
          score: bestScore,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, RANKING.MAX_RESULTS)
      .map((entry) => entry.result);

    return {
      results,
      relaxed: result.relaxed,
      terms: result.terms,
      mode,
      degraded: result.degraded ?? false,
    };
  },
});
