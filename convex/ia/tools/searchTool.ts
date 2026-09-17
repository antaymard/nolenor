import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import { type Id } from "../../_generated/dataModel";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import { nodeTypeValues } from "../../schemas/nodeTypeSchema";
import type { FusedHit } from "../../schemas/searchableChunksSchema";
import { type ThreadCtx, toolAgentNames } from "../agentConfig";
import { EXPLANATION_FIELD, type ToolConfig } from "./toolHelpers";

export const searchToolConfig: ToolConfig = {
  name: "search_canvas",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.worker,
  ],
  mcp: { access: "read" },
};

type SearchStatus =
  | "ok"
  | "no_results"
  | "relaxed"
  | "truncated"
  | "invalid_query"
  | "error";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_HITS_PER_NODE = 5;
const SNIPPET_RADIUS = 50;
const GROUPED_SCAN_MULTIPLIER = 20;
const GROUPED_MIN_SCAN_LIMIT = 100;
const GROUPED_MAX_SCAN_LIMIT = 250;
// Vue compacte : entrées {nodeId, nodeType, title, hitCount} sans snippets,
// ~5-10x moins chères qu'une entrée groupée complète.
const COMPACT_MAX = 150;

type SearchView = "flat" | "grouped" | "compact";

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
}

function clampHitsPerNode(hitsPerNode: number | undefined): number {
  if (typeof hitsPerNode !== "number" || Number.isNaN(hitsPerNode)) {
    return 1;
  }
  return Math.min(Math.max(Math.floor(hitsPerNode), 1), MAX_HITS_PER_NODE);
}

function hintForStatus(status: SearchStatus): string {
  switch (status) {
    case "invalid_query":
      return "Provide at least one of keyword_search or semantic_search, with at least 2 characters each.";
    case "no_results":
      return "No match found; try spelling variants, a shorter keyword token, or a differently phrased semantic query.";
    case "relaxed":
      return "No node satisfied every constraint, so results were widened to approximate matches; drop a term or an operator to tighten.";
    case "truncated":
      return "Results truncated; refine query or pass nodeIds to narrow scope.";
    case "error":
      return "Search failed; retry with the same query or a narrower scope.";
    case "ok":
    default:
      return "Use read_nodes on relevant nodeIds for full context.";
  }
}

/** Extrait centré sur les mots POSITIFS de la requête (jamais sur `-exclu`). */
function buildSnippet(text: string, terms: string[]): string {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (!normalizedText) return "";

  const lowerText = normalizedText.toLowerCase();

  let matchStart = -1;
  let matchLength = 0;
  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    const idx = lowerText.indexOf(lowerTerm);
    if (idx !== -1) {
      matchStart = idx;
      matchLength = lowerTerm.length;
      break;
    }
  }

  if (matchStart === -1) {
    const fallback = normalizedText.slice(0, SNIPPET_RADIUS * 2);
    return fallback.length < normalizedText.length
      ? `${fallback}...`
      : fallback;
  }

  const matchEnd = Math.min(matchStart + matchLength, normalizedText.length);
  const snippetStart = Math.max(0, matchStart - SNIPPET_RADIUS);
  const snippetEnd = Math.min(normalizedText.length, matchEnd + SNIPPET_RADIUS);
  const core = normalizedText.slice(snippetStart, snippetEnd);

  return `${snippetStart > 0 ? "..." : ""}${core}${snippetEnd < normalizedText.length ? "..." : ""}`;
}

function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

const DESCRIPTION_PARTS = [
  "Hybrid search over the current canvas using indexed chunks, every node type is searchable (pdf included).",
  "Provide keyword_search and/or semantic_search (at least one is required, both must express the same intent): keyword_search alone runs a precise keyword lookup, semantic_search alone runs a conceptual vector lookup, and providing both combines them (Reciprocal Rank Fusion).",
  'keyword_search is for precise lookup (names, acronyms, reference IDs, rare words) with Google-style operators: every bare word is required, "quoted text" must appear verbatim, -word excludes any node containing it, and `a OR b` accepts either.',
  "semantic_search is for conceptual lookup: short affirmative statements carrying content words, never a question.",
  "Response shape: status (ok | no_results | relaxed | truncated | invalid_query | error), view (flat | grouped | compact — the effective rendering), searchMode (the branch that actually ran: keyword | semantic | hybrid), hint, hits.",
  "When groupByNode is true and more nodes match than the limit, results switch automatically to a compact view (id/type/title/hitCount only, up to 150 nodes) instead of truncating; pass nodeIds to narrow or read_nodes for detail.",
  "Returns compact snippets and metadata to quickly decide what to read next.",
];

const searchInputSchema = z
  .object({
    explanation: EXPLANATION_FIELD,
    keyword_search: z
      .string()
      .optional()
      .describe(
        'Precise keyword query: all bare words must appear in the same node; use "quoted text" for a verbatim phrase, -word to exclude nodes containing it, and `a OR b` for alternatives.',
      ),
    semantic_search: z
      .string()
      .optional()
      .describe(
        "Conceptual query: short affirmative statements with content words, never a question.",
      ),
    nodeIds: z
      .array(z.string())
      .optional()
      .describe("Optional node IDs to narrow the search scope."),
    nodeTypes: z
      .array(z.enum(nodeTypeValues))
      .optional()
      .describe(
        'Optional node types to restrict the search to, e.g. ["pdf"]. Prefer this over adding words to the query.',
      ),
    groupByNode: z
      .boolean()
      .optional()
      .describe(
        "When true, returns one grouped result per node instead of raw chunk hits.",
      ),
    hitsPerNode: z
      .number()
      .optional()
      .describe(
        "When groupByNode=true, number of top snippets returned per node (default 1, max 5).",
      ),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of hits to return (default 20, max 50)."),
  })
  .superRefine((input, ctx) => {
    if (
      (input.keyword_search?.trim().length ?? 0) === 0 &&
      (input.semantic_search?.trim().length ?? 0) === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide at least one of keyword_search or semantic_search (both must express the same intent when provided together).",
      });
    }
  });

export default function searchTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const { canvasId } = threadCtx;

  return createTool({
    description: DESCRIPTION_PARTS.join(" "),
    inputSchema: searchInputSchema,
    execute: async (ctx, input): Promise<string> => {
      const keywordQuery = input.keyword_search?.trim() ?? "";
      const semanticQuery = input.semantic_search?.trim() ?? "";
      const limit = clampLimit(input.limit);
      const groupByNode = input.groupByNode ?? false;
      const hitsPerNode = clampHitsPerNode(input.hitsPerNode);
      const useKeyword = keywordQuery.length > 0;
      const useSemantic = semanticQuery.length > 0;
      const requestedMode = useKeyword
        ? useSemantic
          ? "hybrid"
          : "keyword"
        : "semantic";
      const requestedView: SearchView = groupByNode ? "grouped" : "flat";

      type BridgeResult = {
        hits: FusedHit[];
        scanned: number;
        truncated: boolean;
        relaxed: boolean;
        terms: string[];
        mode: string;
        degraded: boolean;
      };

      if (
        (useKeyword && keywordQuery.length < 2) ||
        (useSemantic && semanticQuery.length < 2)
      ) {
        return toJsonString({
          status: "invalid_query",
          view: requestedView,
          searchMode: requestedMode,
          hint: hintForStatus("invalid_query"),
          hits: [],
        });
      }

      console.log(`🔎 Running search_canvas on canvas ${canvasId}`);

      try {
        const searchLimit = groupByNode
          ? Math.min(
              Math.max(
                limit * hitsPerNode * GROUPED_SCAN_MULTIPLIER,
                GROUPED_MIN_SCAN_LIMIT,
              ),
              GROUPED_MAX_SCAN_LIMIT,
            )
          : limit;

        // Chaque branche reçoit sa propre formulation. La branche
        // sémantique (vectorSearch en action uniquement) ne doit jamais
        // faire échouer la recherche : repli keyword seul sinon.
        const result: BridgeResult = await ctx
          .runAction(internal.semanticSearch.runHybridSearch, {
            canvasId: canvasId as Id<"canvases">,
            keywordQuery: useKeyword ? keywordQuery : undefined,
            semanticQuery: useSemantic ? semanticQuery : undefined,
            nodeIds: input.nodeIds,
            nodeTypes: input.nodeTypes,
            limit: searchLimit,
            useKeyword,
            useSemantic,
            agentReadableOnly: true,
          })
          .then((hybrid) => ({
            hits: hybrid.hits,
            scanned: hybrid.scanned,
            truncated: hybrid.truncated,
            relaxed: hybrid.relaxed,
            terms: hybrid.terms,
            mode: hybrid.mode,
            degraded: hybrid.degraded ?? false,
          }));

        // Centre les snippets sur les termes keyword ; en sémantique pure,
        // retombe sur les mots porteurs de la requête sémantique.
        const snippetTerms =
          result.terms.length > 0
            ? result.terms
            : semanticQuery.split(/\s+/).filter((word) => word.length >= 2);
        const hits = result.hits.map((hit) => ({
          ...hit,
          snippet: buildSnippet(hit.text, snippetTerms),
        }));

        // De-duplicate same snippet per node to reduce repetitive noise.
        const dedupedByNodeSnippet = Array.from(
          new Map(
            hits.map((hit) => [`${hit.nodeId}::${hit.snippet}`, hit] as const),
          ).values(),
        );

        if (!groupByNode) {
          const isHybrid = result.mode === "hybrid";
          const rankedFlat = dedupedByNodeSnippet
            .sort((a, b) => a.order - b.order)
            .slice(0, limit)
            .map((hit) => ({
              nodeId: hit.nodeId,
              nodeType: hit.nodeType,
              chunkType: hit.chunkType,
              title: hit.title,
              snippet: hit.snippet,
              page: hit.page,
              sectionTitle: hit.sectionTitle,
              ...(isHybrid && hit.sources ? { sources: hit.sources } : {}),
            }));

          const truncated =
            result.truncated || dedupedByNodeSnippet.length > limit;
          const status: SearchStatus =
            rankedFlat.length === 0
              ? "no_results"
              : result.relaxed
                ? "relaxed"
                : truncated
                  ? "truncated"
                  : "ok";

          return toJsonString({
            status,
            view: "flat" satisfies SearchView,
            searchMode: result.mode,
            ...(result.degraded ? { degraded: true } : {}),
            hint: hintForStatus(status),
            hits: rankedFlat,
          });
        }

        const grouped = new Map<
          string,
          {
            nodeId: string;
            nodeType: string;
            title?: string;
            hitCount: number;
            candidates: Array<{
              snippet: string;
              order: number;
              page?: number;
              sectionTitle?: string;
            }>;
          }
        >();

        for (const hit of dedupedByNodeSnippet) {
          const entry = grouped.get(hit.nodeId);
          if (entry) {
            entry.hitCount += 1;
            if (!entry.title && hit.title) entry.title = hit.title;
            entry.candidates.push({
              snippet: hit.snippet,
              order: hit.order,
              page: hit.page,
              sectionTitle: hit.sectionTitle,
            });
          } else {
            grouped.set(hit.nodeId, {
              nodeId: hit.nodeId,
              nodeType: hit.nodeType,
              title: hit.title,
              hitCount: 1,
              candidates: [
                {
                  snippet: hit.snippet,
                  order: hit.order,
                  page: hit.page,
                  sectionTitle: hit.sectionTitle,
                },
              ],
            });
          }
        }

        const groupedEntries = Array.from(grouped.values()).sort((a, b) => {
          return b.hitCount - a.hitCount;
        });

        // Fallback: fetch titles only for pre-existing chunks that don't carry one yet.
        const fetchMissingTitles = async (
          groups: Array<{ nodeId: string; title?: string }>,
        ): Promise<Map<string, string>> => {
          const titlesByNodeId = new Map<string, string>();
          const missing = groups.filter((group) => !group.title);
          if (missing.length > 0) {
            await Promise.all(
              missing.map(async (group) => {
                try {
                  const { nodeData } = await ctx.runQuery(
                    internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
                    {
                      canvasId: canvasId as Id<"canvases">,
                      nodeId: group.nodeId,
                    },
                  );
                  titlesByNodeId.set(group.nodeId, getNodeDataTitle(nodeData));
                } catch {
                  titlesByNodeId.set(group.nodeId, "Untitled");
                }
              }),
            );
          }
          return titlesByNodeId;
        };

        // L'appartenance à une frame, pour chaque node touché : c'est le seul
        // groupement explicite du canvas, et un résultat de recherche qui ne le
        // porte pas oblige à un `list_nodes` de plus pour savoir ce qui va avec
        // quoi. Un seul aller-retour, et seulement s'il y a des résultats — la
        // recherche ne lit pas le canvas autrement.
        const frameIdByNodeId = new Map<string, string>();
        if (groupedEntries.length > 0) {
          const { nodes: canvasNodes } = await ctx.runQuery(
            internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
            { canvasId: canvasId as Id<"canvases"> },
          );
          for (const node of canvasNodes) {
            if (node.parentId) frameIdByNodeId.set(node.id, node.parentId);
          }
        }

        // Débordement groupé : vue compacte (id/type/titre/hitCount, sans
        // snippets) au lieu de tronquer — ~5-10x moins chère par entrée.
        if (groupedEntries.length > limit) {
          const totalMatches = groupedEntries.length;
          const compactEntries = groupedEntries.slice(0, COMPACT_MAX);
          const compactTitles = await fetchMissingTitles(compactEntries);
          const truncated = totalMatches > COMPACT_MAX;
          const status: SearchStatus = truncated ? "truncated" : "ok";
          return toJsonString({
            status,
            view: "compact" satisfies SearchView,
            searchMode: result.mode,
            ...(result.degraded ? { degraded: true } : {}),
            totalMatches,
            hint: truncated
              ? `Compact view: showing ${COMPACT_MAX} of ${totalMatches} matching nodes (id/type/title only). Pass nodeIds or nodeTypes to narrow the scope.`
              : `Compact view: ${totalMatches} matching nodes listed with id/type/title only. Pass nodeIds to search within a subset, or read_nodes for detail.`,
            hits: compactEntries.map((group) => ({
              nodeId: group.nodeId,
              nodeType: group.nodeType,
              title:
                group.title ?? compactTitles.get(group.nodeId) ?? "Untitled",
              frameId: frameIdByNodeId.get(group.nodeId) ?? null,
              hitCount: group.hitCount,
            })),
          });
        }

        const selectedGroups = groupedEntries.slice(0, limit);
        const titlesByNodeId = await fetchMissingTitles(selectedGroups);

        const groupedHits = selectedGroups.map((group) => {
          const uniqueBestCandidates = Array.from(
            new Map(
              group.candidates
                .sort((a, b) => a.order - b.order)
                .map((candidate) => [candidate.snippet, candidate] as const),
            ).values(),
          ).slice(0, hitsPerNode);

          const best = uniqueBestCandidates[0];

          return {
            nodeId: group.nodeId,
            nodeType: group.nodeType,
            title:
              group.title ?? titlesByNodeId.get(group.nodeId) ?? "Untitled",
            frameId: frameIdByNodeId.get(group.nodeId) ?? null,
            hitCount: group.hitCount,
            bestSnippet: best?.snippet,
            bestPage: best?.page,
            bestSectionTitle: best?.sectionTitle,
            snippets:
              hitsPerNode > 1
                ? uniqueBestCandidates.map((candidate) => ({
                    snippet: candidate.snippet,
                    page: candidate.page,
                    sectionTitle: candidate.sectionTitle,
                  }))
                : undefined,
          };
        });

        // Le débordement ne peut plus venir d'ici (bascule compacte
        // ci-dessus) : seul `result.truncated` compte.
        const truncated = result.truncated;
        const status: SearchStatus =
          groupedHits.length === 0
            ? "no_results"
            : result.relaxed
              ? "relaxed"
              : truncated
                ? "truncated"
                : "ok";

        return toJsonString({
          status,
          view: "grouped" satisfies SearchView,
          searchMode: result.mode,
          ...(result.degraded ? { degraded: true } : {}),
          hint: hintForStatus(status),
          hits: groupedHits,
        });
      } catch (error) {
        console.error("search_canvas error:", error);

        return toJsonString({
          status: "error",
          view: requestedView,
          searchMode: requestedMode,
          hint: hintForStatus("error"),
          hits: [],
        });
      }
    },
  });
}
