import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import { chunkTypeValidator } from "./schemas/searchableChunksSchema";
import { nodeTypeValidator } from "./schemas/nodeTypeSchema";
import * as SearchableChunkModels from "./models/searchableChunkModels";
import { RANKING, scoreNode } from "./lib/searchScoring";
import {
  matchesParsedQuery,
  normalizeHaystacks,
  parseSearchQuery,
} from "./lib/searchQuery";
import { stripLoneSurrogates } from "./lib/textSanitize";

const SNIPPET_RADIUS = 90;
const MAX_SNIPPETS_PER_CHUNK = 1;
const MAX_SNIPPETS_PER_NODE = 5;
const MAX_MATCHING_CHUNKS = 50;

export const search = query({
  args: {
    query: v.string(),
    canvasId: v.id("canvases"),
    /** Filtre de type piloté par les chips de l'UI (pas par la syntaxe). */
    nodeTypes: v.optional(v.array(nodeTypeValidator)),
  },
  returns: v.object({
    results: v.array(
      v.object({
        type: v.string(),
        nodeId: v.string(),
        nodeDataId: v.id("nodeDatas"),
        title: v.optional(v.string()),
        images: v.array(
          v.object({
            imageUrl: v.string(),
            page: v.optional(v.number()),
          }),
        ),
        snippets: v.array(
          v.object({
            snippet: v.string(),
            chunkType: chunkTypeValidator,
            order: v.number(),
            page: v.optional(v.number()),
            imageUrl: v.optional(v.string()),
            matchStart: v.number(),
            matchEnd: v.number(),
          }),
        ),
      }),
    ),
    /** Aucun node ne satisfaisait toutes les contraintes : on montre l'approchant. */
    relaxed: v.boolean(),
    /** Mots positifs de la requête : source unique du surlignage côté UI. */
    terms: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    // Vérifier l'accès au canvas
    await requireCanvasAccess(ctx, args.canvasId, authUserId); // viewer required

    // La saisie peut porter des opérateurs ("phrase", -exclusion, OR) que
    // l'index ne connaît pas : on les traduit en contraintes appliquées après.
    const parsed = parseSearchQuery(args.query);
    if (parsed.isEmpty) {
      return { results: [], relaxed: false, terms: parsed.highlightTerms };
    }

    const chunks = await SearchableChunkModels.searchChunks(ctx, {
      canvasId: args.canvasId,
      text: parsed.searchText,
      nodeTypes: args.nodeTypes,
      limit: MAX_MATCHING_CHUNKS,
    });

    const groupedByNodeId = new Map<string, typeof chunks>();
    for (const chunk of chunks) {
      const existing = groupedByNodeId.get(chunk.nodeId);
      if (existing) {
        existing.push(chunk);
      } else {
        groupedByNodeId.set(chunk.nodeId, [chunk]);
      }
    }

    // Les contraintes se jugent au niveau du NODE : « ce document contient tous
    // les mots », pas « ce passage les contient ».
    const haystacksByNodeId = new Map<string, string[]>();
    for (const [nodeId, nodeChunks] of groupedByNodeId) {
      haystacksByNodeId.set(
        nodeId,
        normalizeHaystacks([
          // Les chunks d'un même node partagent leur titre : le dédupliquer
          // évite de le normaliser 50 fois pour un PDF.
          ...new Set(nodeChunks.map((chunk) => chunk.title)),
          ...nodeChunks.map((chunk) => chunk.text),
        ]),
      );
    }

    const excludedNodeIds = await SearchableChunkModels.collectExcludedNodeIds(
      ctx,
      {
        canvasId: args.canvasId,
        excluded: parsed.excluded,
        haystacksByNodeId,
      },
    );

    const candidates = Array.from(groupedByNodeId.entries()).filter(
      ([nodeId]) => !excludedNodeIds.has(nodeId),
    );
    const strict = candidates.filter(([nodeId]) =>
      matchesParsedQuery(haystacksByNodeId.get(nodeId) ?? [], parsed),
    );

    // Le filtrage strict s'appuie sur les chunks remontés (bornés) : quand il
    // ne laisse rien, mieux vaut l'approchant que le vide — les exclusions,
    // elles, restent toujours appliquées.
    const relaxed = strict.length === 0 && candidates.length > 0;
    const selected = relaxed ? candidates : strict;

    const terms = parsed.normalizedTerms;
    const phrase = parsed.phrases[0] ?? terms.join(" ");

    const scored = selected.map(([nodeId, nodeChunks]) => {
      const result = {
        type: nodeChunks[0].nodeType,
        nodeId,
        nodeDataId: nodeChunks[0].nodeDataId,
        title: nodeChunks[0].title
          ? stripLoneSurrogates(nodeChunks[0].title)
          : nodeChunks[0].title,
        images: Array.from(
          new Map(
            nodeChunks
              .flatMap((chunk) =>
                getImageUrlsFromMetadata(chunk.metadata).map(
                  (imageUrl) =>
                    [
                      imageUrl,
                      {
                        imageUrl,
                        page: getPageFromMetadata(chunk.metadata),
                      },
                    ] as const,
                ),
              )
              .filter(
                (
                  item,
                ): item is readonly [
                  string,
                  { imageUrl: string; page: number | undefined },
                ] => item !== null,
              ),
          ).values(),
        ),
        snippets: nodeChunks
          .flatMap((chunk) =>
            buildChunkSnippets(chunk.text, parsed.highlightTerms).map(
              (match) => ({
                snippet: stripLoneSurrogates(match.snippet),
                chunkType: chunk.chunkType,
                order: chunk.order,
                page: getPageFromMetadata(chunk.metadata),
                imageUrl: getImageUrlFromMetadata(chunk.metadata),
                matchStart: match.matchStart,
                matchEnd: match.matchEnd,
              }),
            ),
          )
          .slice(0, MAX_SNIPPETS_PER_NODE),
      };

      // Score titre > body, pondéré par couverture + proximité des termes.
      const score =
        terms.length === 0
          ? 0
          : scoreNode({
              title: nodeChunks[0].title,
              texts: nodeChunks.map((chunk) => chunk.text),
              terms,
              phrase,
            });

      return { result, score };
    });

    // Départage : score, puis nb de snippets, puis titre alphabétique.
    if (terms.length > 0) {
      scored.sort(
        (a, b) =>
          b.score - a.score ||
          b.result.snippets.length - a.result.snippets.length ||
          (a.result.title ?? "").localeCompare(b.result.title ?? ""),
      );
    }

    return {
      results: scored.map((entry) => entry.result).slice(0, RANKING.MAX_RESULTS),
      relaxed,
      terms: parsed.highlightTerms,
    };
  },
});

export const listPdfPages = query({
  args: {
    nodeDataId: v.id("nodeDatas"),
    canvasId: v.id("canvases"),
  },
  returns: v.array(
    v.object({
      order: v.number(),
      text: v.string(),
      page: v.optional(v.number()),
      totalPages: v.optional(v.number()),
      sections: v.array(
        v.object({
          level: v.string(),
          title: v.string(),
        }),
      ),
      hasImages: v.boolean(),
      imageCount: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, args.canvasId, authUserId);
    return await SearchableChunkModels.listPdfPagesByNodeDataId(ctx, {
      nodeDataId: args.nodeDataId,
    });
  },
});

/** Extraits centrés sur les mots POSITIFS de la requête (jamais sur `-exclu`). */
function buildChunkSnippets(text: string, queryTerms: string[]) {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (!normalizedText) return [];

  const terms = Array.from(
    new Set(queryTerms.map((term) => term.toLowerCase())),
  );

  if (terms.length === 0) {
    return [
      {
        snippet: ellipsize(normalizedText.slice(0, SNIPPET_RADIUS * 2)),
        matchStart: 0,
        matchEnd: Math.min(normalizedText.length, SNIPPET_RADIUS * 2),
      },
    ];
  }

  const matches: Array<{
    snippet: string;
    matchStart: number;
    matchEnd: number;
  }> = [];
  const lowerText = normalizedText.toLowerCase();

  for (const term of terms) {
    let start = 0;
    while (matches.length < MAX_SNIPPETS_PER_CHUNK) {
      const idx = lowerText.indexOf(term, start);
      if (idx === -1) break;

      const matchStart = idx;
      const matchEnd = idx + term.length;
      const snippetStart = Math.max(0, matchStart - SNIPPET_RADIUS);
      const snippetEnd = Math.min(
        normalizedText.length,
        matchEnd + SNIPPET_RADIUS,
      );
      const rawSnippet = normalizedText.slice(snippetStart, snippetEnd);

      matches.push({
        snippet: `${snippetStart > 0 ? "..." : ""}${rawSnippet}${snippetEnd < normalizedText.length ? "..." : ""}`,
        matchStart,
        matchEnd,
      });

      start = matchEnd;
    }

    if (matches.length >= MAX_SNIPPETS_PER_CHUNK) break;
  }

  if (matches.length === 0) {
    return [
      {
        snippet: ellipsize(normalizedText.slice(0, SNIPPET_RADIUS * 2)),
        matchStart: 0,
        matchEnd: Math.min(normalizedText.length, SNIPPET_RADIUS * 2),
      },
    ];
  }

  return matches;
}

function getPageFromMetadata(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const maybePage = (metadata as { page?: unknown }).page;
  return typeof maybePage === "number" ? maybePage : undefined;
}

function getImageUrlFromMetadata(metadata: unknown): string | undefined {
  const urls = getImageUrlsFromMetadata(metadata);
  return urls[0];
}

function getImageUrlsFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];

  const structuredImage = (metadata as { image?: unknown }).image;
  if (structuredImage && typeof structuredImage === "object") {
    const structuredImageUrl = (structuredImage as { url?: unknown }).url;
    if (typeof structuredImageUrl === "string") {
      return [structuredImageUrl];
    }
  }

  const maybeImageUrls = (metadata as { imageUrls?: unknown }).imageUrls;
  if (Array.isArray(maybeImageUrls)) {
    return maybeImageUrls.filter(
      (value): value is string => typeof value === "string",
    );
  }

  const maybeImageUrl = (metadata as { imageUrl?: unknown }).imageUrl;
  return typeof maybeImageUrl === "string" ? [maybeImageUrl] : [];
}

function ellipsize(text: string): string {
  return text.length > SNIPPET_RADIUS * 2
    ? `${text.slice(0, SNIPPET_RADIUS * 2)}...`
    : text;
}
