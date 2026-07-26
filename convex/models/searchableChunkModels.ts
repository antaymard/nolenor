import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
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
};

// Search defaults are intentionally conservative to keep tool calls predictable.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 250;
const MAX_SCAN_CAP = 250;
const SCAN_MULTIPLIER = 5;

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

export async function fullTextSearch(
  ctx: QueryCtx,
  {
    canvasId,
    query,
    nodeIds,
    limit,
  }: {
    canvasId: Id<"canvases">;
    query: string;
    nodeIds?: string[];
    limit?: number;
  },
): Promise<FullTextSearchResult> {
  // 1) Resolve effective limits for response and scan window.
  const effectiveLimit = clampLimit(limit);

  // Read more than we return so post-filtering (nodeIds) still has good recall.
  const scanLimit = Math.min(effectiveLimit * SCAN_MULTIPLIER, MAX_SCAN_CAP);

  // 2) Run indexed full-text search scoped to the canvas, on both content and title.
  const [textChunks, titleChunks] = await Promise.all([
    ctx.db
      .query("searchableChunks")
      .withSearchIndex("search_text", (q) =>
        q.search("text", query).eq("canvasId", canvasId),
      )
      .take(scanLimit),
    ctx.db
      .query("searchableChunks")
      .withSearchIndex("search_title", (q) =>
        q.search("title", query).eq("canvasId", canvasId),
      )
      .take(scanLimit),
  ]);

  const chunks = Array.from(
    new Map(
      [...textChunks, ...titleChunks].map(
        (chunk) => [chunk._id, chunk] as const,
      ),
    ).values(),
  );

  // 3) Apply optional node-level filtering.
  const nodeIdFilter =
    nodeIds && nodeIds.length > 0 ? new Set(nodeIds) : undefined;

  const filtered = nodeIdFilter
    ? chunks.filter((chunk) => nodeIdFilter.has(chunk.nodeId))
    : chunks;

  // 4) Truncate for payload size, then project to the compact response shape.
  const selected = filtered.slice(0, effectiveLimit);

  // If we had more filtered hits than returned OR we hit scan cap on either index, signal truncation.
  const truncated =
    filtered.length > effectiveLimit ||
    textChunks.length === scanLimit ||
    titleChunks.length === scanLimit;

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
  };
}
