import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  type ExcludedNeedle,
  haystacksContainToken,
  matchesParsedQuery,
  normalizeHaystacks,
  parseSearchQuery,
} from "../lib/searchQuery";
import type { NodeType } from "../schemas/nodeTypeSchema";
import { stripLoneSurrogates } from "../lib/textSanitize";

type SearchableChunk = Doc<"searchableChunks">;

export async function upsertChunks(
  ctx: MutationCtx,
  {
    nodeDataId,
    chunks,
  }: {
    nodeDataId: Id<"nodeDatas">;
    chunks: Array<Omit<SearchableChunk, "_id" | "_creationTime">>;
  },
): Promise<void> {
  // Keep implementation simple and predictable: replace all chunks for this node.
  const existing = await ctx.db
    .query("searchableChunks")
    .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
    .collect();

  for (const chunk of existing) {
    await ctx.db.delete(chunk._id);
  }

  for (const chunk of chunks) {
    await ctx.db.insert("searchableChunks", chunk);
  }
}

export async function deleteByNodeDataId(
  ctx: MutationCtx,
  { nodeDataId }: { nodeDataId: Id<"nodeDatas"> },
): Promise<void> {
  const chunks = await ctx.db
    .query("searchableChunks")
    .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
    .collect();

  for (const chunk of chunks) {
    await ctx.db.delete(chunk._id);
  }
}

export async function deleteByCanvasId(
  ctx: MutationCtx,
  { canvasId }: { canvasId: Id<"canvases"> },
): Promise<void> {
  const chunks = await ctx.db
    .query("searchableChunks")
    .withIndex("by_canvasId", (q) => q.eq("canvasId", canvasId))
    .collect();

  for (const chunk of chunks) {
    await ctx.db.delete(chunk._id);
  }
}

export async function updateCanvasId(
  ctx: MutationCtx,
  {
    nodeDataId,
    canvasId,
  }: { nodeDataId: Id<"nodeDatas">; canvasId: Id<"canvases"> },
): Promise<void> {
  const chunks = await ctx.db
    .query("searchableChunks")
    .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
    .collect();

  for (const chunk of chunks) {
    await ctx.db.patch(chunk._id, { canvasId });
  }
}

export async function listByNodeDataId(
  ctx: QueryCtx,
  { nodeDataId }: { nodeDataId: Id<"nodeDatas"> },
): Promise<SearchableChunk[]> {
  return await ctx.db
    .query("searchableChunks")
    .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
    .collect();
}

export type PdfPageChunk = {
  order: number;
  text: string;
  page: number | undefined;
  totalPages: number | undefined;
  sections: Array<{ level: string; title: string }>;
  hasImages: boolean;
  imageCount: number | undefined;
};

function parsePdfPageMetadata(metadata: unknown): {
  page: number | undefined;
  totalPages: number | undefined;
  sections: Array<{ level: string; title: string }>;
  hasImages: boolean;
  imageCount: number | undefined;
} {
  if (!metadata || typeof metadata !== "object") {
    return {
      page: undefined,
      totalPages: undefined,
      sections: [],
      hasImages: false,
      imageCount: undefined,
    };
  }

  const m = metadata as {
    page?: unknown;
    totalPages?: unknown;
    sections?: unknown;
    hasImages?: unknown;
    imageCount?: unknown;
  };

  const sections = Array.isArray(m.sections)
    ? m.sections.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const e = entry as { level?: unknown; title?: unknown };
        const level = typeof e.level === "string" ? e.level : null;
        const title = typeof e.title === "string" ? e.title.trim() : "";
        if (!level || !title) return [];
        return [{ level, title: stripLoneSurrogates(title) }];
      })
    : [];

  return {
    page: typeof m.page === "number" ? m.page : undefined,
    totalPages: typeof m.totalPages === "number" ? m.totalPages : undefined,
    sections,
    hasImages: m.hasImages === true,
    imageCount: typeof m.imageCount === "number" ? m.imageCount : undefined,
  };
}

export async function listPdfPagesByNodeDataId(
  ctx: QueryCtx,
  { nodeDataId }: { nodeDataId: Id<"nodeDatas"> },
): Promise<PdfPageChunk[]> {
  const chunks = await ctx.db
    .query("searchableChunks")
    .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
    .collect();

  return chunks
    .filter((chunk) => chunk.chunkType === "page")
    .map((chunk) => ({
      order: chunk.order,
      text: stripLoneSurrogates(chunk.text),
      ...parsePdfPageMetadata(chunk.metadata),
    }))
    .sort((a, b) => a.order - b.order);
}

type FullTextSearchHit = {
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  nodeType: SearchableChunk["nodeType"];
  chunkType: SearchableChunk["chunkType"];
  order: number;
  text: string;
  title?: string;
  page?: number;
  sectionTitle?: string;
};

type FullTextSearchResult = {
  hits: FullTextSearchHit[];
  scanned: number;
  limit: number;
  truncated: boolean;
  /** Aucun node ne satisfaisait toutes les contraintes : résultats élargis. */
  relaxed: boolean;
  /** Mots positifs de la requête, pour centrer les extraits côté appelant. */
  terms: string[];
};

// Search defaults are intentionally conservative to keep tool calls predictable.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 250;
const MAX_SCAN_CAP = 250;
const SCAN_MULTIPLIER = 5;

export const CHUNK_SEARCH_LIMITS = {
  /**
   * `filterFields` ne fait que de l'égalité : N types cochés = N recherches.
   * Au-delà, on garde une seule recherche et on filtre en TS.
   */
  MAX_INDEXED_NODE_TYPES: 3,
  /** Fenêtre de scan d'une recherche d'exclusion. */
  EXCLUSION_SCAN: 50,
} as const;

// Clamp user-provided limit into a safe, bounded integer.
function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
}

// Metadata is dynamic; extract page only when present and well-typed.
function getPage(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const page = (metadata as { page?: unknown }).page;
  return typeof page === "number" ? page : undefined;
}

// For PDF chunks, keep only the first section title as a compact locator.
function getSectionTitle(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const sections = (metadata as { sections?: unknown }).sections;
  if (!Array.isArray(sections) || sections.length === 0) return undefined;

  const firstSection = sections[0];
  if (!firstSection || typeof firstSection !== "object") return undefined;

  const title = (firstSection as { title?: unknown }).title;
  if (typeof title !== "string") return undefined;

  const trimmed = title.trim();
  return trimmed.length > 0 ? stripLoneSurrogates(trimmed) : undefined;
}

/**
 * Recherche indexée sur le contenu ET le titre, scopée au canvas, dédupliquée.
 * Le type de node est poussé dans l'index quand le fan-out reste raisonnable,
 * et re-filtré en TS dans tous les cas (exact et gratuit).
 */
export async function searchChunks(
  ctx: QueryCtx,
  {
    canvasId,
    text,
    nodeTypes,
    limit,
  }: {
    canvasId: Id<"canvases">;
    text: string;
    nodeTypes?: NodeType[];
    limit: number;
  },
): Promise<SearchableChunk[]> {
  const types = nodeTypes ?? [];
  const indexedTypes: Array<NodeType | undefined> =
    types.length > 0 && types.length <= CHUNK_SEARCH_LIMITS.MAX_INDEXED_NODE_TYPES
      ? types
      : [undefined];

  const batches = await Promise.all(
    indexedTypes.flatMap((nodeType) => [
      ctx.db
        .query("searchableChunks")
        .withSearchIndex("search_text", (q) => {
          const scoped = q.search("text", text).eq("canvasId", canvasId);
          return nodeType ? scoped.eq("nodeType", nodeType) : scoped;
        })
        .take(limit),
      ctx.db
        .query("searchableChunks")
        .withSearchIndex("search_title", (q) => {
          const scoped = q.search("title", text).eq("canvasId", canvasId);
          return nodeType ? scoped.eq("nodeType", nodeType) : scoped;
        })
        .take(limit),
    ]),
  );

  const deduped = Array.from(
    new Map(
      batches.flat().map((chunk) => [chunk._id, chunk] as const),
    ).values(),
  );

  return types.length > 0
    ? deduped.filter((chunk) => types.includes(chunk.nodeType))
    : deduped;
}

/**
 * Nodes portant l'un des mots exclus. Un post-filtre sur les seuls chunks
 * remontés ne suffirait pas : le mot exclu vit souvent dans un AUTRE chunk du
 * node, qui n'a pas matché la requête. On interroge donc l'index pour chaque
 * exclusion, puis on confirme sur le texte réel — la recherche Convex tolère
 * les approximations, et `-java` ne doit pas emporter « javascript ».
 */
export async function collectExcludedNodeIds(
  ctx: QueryCtx,
  {
    canvasId,
    excluded,
    haystacksByNodeId,
  }: {
    canvasId: Id<"canvases">;
    excluded: ExcludedNeedle[];
    haystacksByNodeId: Map<string, string[]>;
  },
): Promise<Set<string>> {
  const excludedNodeIds = new Set<string>();
  if (excluded.length === 0 || haystacksByNodeId.size === 0) {
    return excludedNodeIds;
  }

  // 1) Ce qui est déjà chargé : gratuit.
  for (const [nodeId, haystacks] of haystacksByNodeId) {
    if (
      excluded.some((needle) =>
        haystacksContainToken(haystacks, needle.normalized),
      )
    ) {
      excludedNodeIds.add(nodeId);
    }
  }

  // 2) Le reste du node, via l'index.
  const batches = await Promise.all(
    excluded.map(async (needle) => ({
      needle,
      chunks: await searchChunks(ctx, {
        canvasId,
        text: needle.original,
        limit: CHUNK_SEARCH_LIMITS.EXCLUSION_SCAN,
      }),
    })),
  );

  for (const { needle, chunks } of batches) {
    for (const chunk of chunks) {
      if (!haystacksByNodeId.has(chunk.nodeId)) continue;
      if (excludedNodeIds.has(chunk.nodeId)) continue;
      const haystacks = normalizeHaystacks([chunk.title, chunk.text]);
      if (haystacksContainToken(haystacks, needle.normalized)) {
        excludedNodeIds.add(chunk.nodeId);
      }
    }
  }

  return excludedNodeIds;
}

export async function fullTextSearch(
  ctx: QueryCtx,
  {
    canvasId,
    query,
    nodeIds,
    nodeTypes,
    limit,
  }: {
    canvasId: Id<"canvases">;
    query: string;
    nodeIds?: string[];
    nodeTypes?: NodeType[];
    limit?: number;
  },
): Promise<FullTextSearchResult> {
  // 1) Resolve effective limits for response and scan window.
  const effectiveLimit = clampLimit(limit);

  // Read more than we return so post-filtering (nodeIds) still has good recall.
  const scanLimit = Math.min(effectiveLimit * SCAN_MULTIPLIER, MAX_SCAN_CAP);

  // 2) Traduire les opérateurs de la requête en contraintes post-recherche.
  const parsed = parseSearchQuery(query);
  if (parsed.isEmpty) {
    return {
      hits: [],
      scanned: 0,
      limit: effectiveLimit,
      truncated: false,
      relaxed: false,
      terms: parsed.highlightTerms,
    };
  }

  // 3) Run indexed full-text search scoped to the canvas, on both content and title.
  const chunks = await searchChunks(ctx, {
    canvasId,
    text: parsed.searchText,
    nodeTypes,
    limit: scanLimit,
  });

  // 4) Apply optional node-level filtering.
  const nodeIdFilter =
    nodeIds && nodeIds.length > 0 ? new Set(nodeIds) : undefined;

  const scoped = nodeIdFilter
    ? chunks.filter((chunk) => nodeIdFilter.has(chunk.nodeId))
    : chunks;

  // 5) Les contraintes se jugent par node, pas par chunk.
  const haystacksByNodeId = new Map<string, string[]>();
  for (const chunk of scoped) {
    const normalized = normalizeHaystacks([chunk.title, chunk.text]);
    const existing = haystacksByNodeId.get(chunk.nodeId);
    if (existing) {
      existing.push(...normalized);
    } else {
      haystacksByNodeId.set(chunk.nodeId, normalized);
    }
  }

  const excludedNodeIds = await collectExcludedNodeIds(ctx, {
    canvasId,
    excluded: parsed.excluded,
    haystacksByNodeId,
  });

  const kept = scoped.filter((chunk) => !excludedNodeIds.has(chunk.nodeId));
  const strictNodeIds = new Set(
    Array.from(haystacksByNodeId.entries())
      .filter(
        ([nodeId, haystacks]) =>
          !excludedNodeIds.has(nodeId) && matchesParsedQuery(haystacks, parsed),
      )
      .map(([nodeId]) => nodeId),
  );

  const strict = kept.filter((chunk) => strictNodeIds.has(chunk.nodeId));

  // Le filtrage strict travaille sur une fenêtre bornée : plutôt que de rendre
  // le vide, on élargit en le signalant. Les exclusions restent appliquées.
  const relaxed = strict.length === 0 && kept.length > 0;
  const filtered = relaxed ? kept : strict;

  // 6) Truncate for payload size, then project to the compact response shape.
  const selected = filtered.slice(0, effectiveLimit);

  // If we had more filtered hits than returned OR we hit the scan cap, signal truncation.
  const truncated = filtered.length > effectiveLimit || chunks.length >= scanLimit;

  return {
    hits: selected.map((chunk) => ({
      nodeId: chunk.nodeId,
      nodeDataId: chunk.nodeDataId,
      nodeType: chunk.nodeType,
      chunkType: chunk.chunkType,
      order: chunk.order,
      text: stripLoneSurrogates(chunk.text),
      title: chunk.title ? stripLoneSurrogates(chunk.title) : chunk.title,
      page: getPage(chunk.metadata),
      sectionTitle: getSectionTitle(chunk.metadata),
    })),
    scanned: chunks.length,
    limit: effectiveLimit,
    truncated,
    relaxed,
    terms: parsed.highlightTerms,
  };
}
