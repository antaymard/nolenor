import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import { chunkTypeValidator } from "./schemas/searchableChunksSchema";
import * as SearchableChunkModels from "./models/searchableChunkModels";

const SNIPPET_RADIUS = 90;
const MAX_SNIPPETS_PER_CHUNK = 1;
const MAX_SNIPPETS_PER_NODE = 5;
const MAX_MATCHING_CHUNKS = 50;

export const search = query({
  args: {
    query: v.string(),
    canvasId: v.id("canvases"),
  },
  returns: v.array(
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
      chunks: v.array(v.any()),
    }),
  ),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    // Vérifier l'accès au canvas
    await requireCanvasAccess(ctx, args.canvasId, authUserId); // viewer required

    // Rechercher les chunks correspondants dans le contenu ET dans le titre
    const [textHits, titleHits] = await Promise.all([
      ctx.db
        .query("searchableChunks")
        .withSearchIndex("search_text", (q) =>
          q.search("text", args.query).eq("canvasId", args.canvasId),
        )
        .take(MAX_MATCHING_CHUNKS),
      ctx.db
        .query("searchableChunks")
        .withSearchIndex("search_title", (q) =>
          q.search("title", args.query).eq("canvasId", args.canvasId),
        )
        .take(MAX_MATCHING_CHUNKS),
    ]);

    const results = Array.from(
      new Map(
        [...textHits, ...titleHits].map((chunk) => [chunk._id, chunk] as const),
      ).values(),
    );

    const groupedByNodeId = new Map<string, typeof results>();
    for (const chunk of results) {
      const existing = groupedByNodeId.get(chunk.nodeId);
      if (existing) {
        existing.push(chunk);
      } else {
        groupedByNodeId.set(chunk.nodeId, [chunk]);
      }
    }

    return Array.from(groupedByNodeId.entries()).map(([nodeId, chunks]) => ({
      type: chunks[0].nodeType,
      nodeId,
      nodeDataId: chunks[0].nodeDataId,
      title: chunks[0].title,
      images: Array.from(
        new Map(
          chunks
            .flatMap((chunk) =>
              getImageUrlsFromMetadata(chunk.metadata).map(
                (imageUrl) =>
                  [
                    imageUrl,
                    { imageUrl, page: getPageFromMetadata(chunk.metadata) },
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
      snippets: chunks
        .flatMap((chunk) =>
          buildChunkSnippets(chunk.text, args.query).map((match) => ({
            snippet: match.snippet,
            chunkType: chunk.chunkType,
            order: chunk.order,
            page: getPageFromMetadata(chunk.metadata),
            imageUrl: getImageUrlFromMetadata(chunk.metadata),
            matchStart: match.matchStart,
            matchEnd: match.matchEnd,
          })),
        )
        .slice(0, MAX_SNIPPETS_PER_NODE),
      chunks,
    }));
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

function buildChunkSnippets(text: string, query: string) {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (!normalizedText) return [];

  const terms = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
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
