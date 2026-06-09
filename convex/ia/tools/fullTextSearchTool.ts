import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import { type ThreadCtx, toolAgentNames } from "../agentConfig";
import { ToolConfig } from "./toolHelpers";

export const fullTextSearchToolConfig: ToolConfig = {
  name: "full_text_search",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
};

type SearchStatus =
  | "ok"
  | "no_results"
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
      return "Use a more specific token (at least 2 characters).";
    case "no_results":
      return "No exact match found; try spelling variants or a shorter token.";
    case "truncated":
      return "Results truncated; refine query or pass nodeIds to narrow scope.";
    case "error":
      return "Search failed; retry with the same query or a narrower scope.";
    case "ok":
    default:
      return "Use read_nodes on relevant nodeIds for full context.";
  }
}

function buildSnippet(text: string, query: string): string {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (!normalizedText) return "";

  const lowerText = normalizedText.toLowerCase();
  const lowerQuery = query.toLowerCase();

  let matchStart = lowerText.indexOf(lowerQuery);
  if (matchStart === -1) {
    const terms = lowerQuery
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2);

    for (const term of terms) {
      const idx = lowerText.indexOf(term);
      if (idx !== -1) {
        matchStart = idx;
        break;
      }
    }
  }

  if (matchStart === -1) {
    const fallback = normalizedText.slice(0, SNIPPET_RADIUS * 2);
    return fallback.length < normalizedText.length
      ? `${fallback}...`
      : fallback;
  }

  const matchEnd = Math.min(
    matchStart + lowerQuery.length,
    normalizedText.length,
  );
  const snippetStart = Math.max(0, matchStart - SNIPPET_RADIUS);
  const snippetEnd = Math.min(normalizedText.length, matchEnd + SNIPPET_RADIUS);
  const core = normalizedText.slice(snippetStart, snippetEnd);

  return `${snippetStart > 0 ? "..." : ""}${core}${snippetEnd < normalizedText.length ? "..." : ""}`;
}

function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

export default function fullTextSearchTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Search exact tokens in the current canvas using full-text indexed chunks, every node type is searchable (pdf inclduded). Use this for precise lookup (names, acronyms, reference IDs, rare words). Returns compact snippets and metadata to quickly decide what to read next.",
    inputSchema: z.object({
      explanation: z
        .string()
        .describe("3-5 words explaining the research intent."),
      query: z
        .string()
        .describe("The exact token or short phrase to search for."),
      nodeIds: z
        .array(z.string())
        .optional()
        .describe("Optional node IDs to narrow the search scope."),
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
    }),
    execute: async (ctx, input): Promise<string> => {
      const normalizedQuery = input.query.trim();
      const limit = clampLimit(input.limit);
      const groupByNode = input.groupByNode ?? false;
      const hitsPerNode = clampHitsPerNode(input.hitsPerNode);

      if (normalizedQuery.length < 2) {
        return toJsonString({
          success: false,
          status: "invalid_query",
          query: normalizedQuery,
          mode: groupByNode ? "grouped" : "flat",
          returned: 0,
          limit,
          scanned: 0,
          truncated: false,
          hint: hintForStatus("invalid_query"),
          hits: [],
        });
      }

      console.log(`🔎 Running full_text_search on canvas ${canvasId}`);

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

        const result = await ctx.runQuery(
          internal.wrappers.searchableChunkWrappers.fullTextSearch,
          {
            canvasId: canvasId as Id<"canvases">,
            query: normalizedQuery,
            nodeIds: input.nodeIds,
            limit: searchLimit,
          },
        );

        const hits = result.hits.map((hit) => ({
          ...hit,
          snippet: buildSnippet(hit.text, normalizedQuery),
        }));

        // De-duplicate same snippet per node to reduce repetitive noise.
        const dedupedByNodeSnippet = Array.from(
          new Map(
            hits.map((hit) => [`${hit.nodeId}::${hit.snippet}`, hit] as const),
          ).values(),
        );

        if (!groupByNode) {
          const rankedFlat = dedupedByNodeSnippet
            .sort((a, b) => a.order - b.order)
            .slice(0, limit)
            .map((hit) => ({
              nodeId: hit.nodeId,
              nodeDataId: hit.nodeDataId,
              nodeType: hit.nodeType,
              chunkType: hit.chunkType,
              order: hit.order,
              title: hit.title,
              snippet: hit.snippet,
              page: hit.page,
              sectionTitle: hit.sectionTitle,
            }));

          const truncated =
            result.truncated || dedupedByNodeSnippet.length > limit;
          const status: SearchStatus =
            rankedFlat.length === 0
              ? "no_results"
              : truncated
                ? "truncated"
                : "ok";

          return toJsonString({
            status,
            query: normalizedQuery,
            mode: "flat",
            returned: rankedFlat.length,
            limit,
            scanned: result.scanned,
            truncated,
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

        const selectedGroups = groupedEntries.slice(0, limit);

        // Fallback: fetch titles only for pre-existing chunks that don't carry one yet.
        const groupsMissingTitle = selectedGroups.filter(
          (group) => !group.title,
        );
        const titlesByNodeId = new Map<string, string>();

        if (groupsMissingTitle.length > 0) {
          await Promise.all(
            groupsMissingTitle.map(async (group) => {
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

        const truncated = result.truncated || groupedEntries.length > limit;
        const status: SearchStatus =
          groupedHits.length === 0
            ? "no_results"
            : truncated
              ? "truncated"
              : "ok";

        return toJsonString({
          status,
          query: normalizedQuery,
          mode: "grouped",
          returned: groupedHits.length,
          limit,
          scanned: result.scanned,
          truncated,
          hint: hintForStatus(status),
          hits: groupedHits,
        });
      } catch (error) {
        console.error("full_text_search error:", error);

        return toJsonString({
          success: false,
          status: "error",
          query: normalizedQuery,
          mode: groupByNode ? "grouped" : "flat",
          returned: 0,
          limit,
          scanned: 0,
          truncated: false,
          hint: hintForStatus("error"),
          hits: [],
        });
      }
    },
  });
}
