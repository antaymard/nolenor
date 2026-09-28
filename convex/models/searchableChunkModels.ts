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
import { isNodeTypeReadableByAgent } from "../config/nodeConfig";
import { stripLoneSurrogates } from "../lib/textSanitize";
import {
  getImageUrlFromMetadata,
  getSectionTitleFromMetadata,
  getTimeRangeFromMetadata,
} from "../lib/chunkMetadata";
import type {
  ChunkTypeValue,
  FusedHit,
} from "../schemas/searchableChunksSchema";
import {
  getTranscriptSourceKey,
  parseTranscriptMetadata,
  splitTranscriptText,
  type TranscriptChunkMetadata,
} from "../lib/transcriptChunks";

type SearchableChunk = Doc<"searchableChunks">;

/** Les types de chunk que possède le chunkBuilder (dérivés des `values`). */
export const BUILDER_CHUNK_TYPES = [
  "node",
  "page",
  "annotation",
] as const satisfies ReadonlyArray<ChunkTypeValue>;

type ChunkInput = Omit<SearchableChunk, "_id" | "_creationTime">;

/** Mise à jour d'un chunk `transcript` préservé (renommage du node). */
export type TranscriptChunkPatch = {
  id: Id<"searchableChunks">;
  title?: string;
  embedding?: number[];
  embeddingModel?: string;
};

/**
 * Remplace les chunks d'un node, mais SEULEMENT ceux des types listés dans
 * `replaceChunkTypes` (par défaut : ceux du chunkBuilder).
 *
 * Longtemps un delete-then-insert de TOUS les chunks du node. Ça ne tient plus
 * depuis les chunks `transcript` : ils sont de la donnée primaire, déjà payée,
 * et le builder repasse à chaque write de `values` (renommage, boucle…). Un
 * appelant ne remplace donc que ce qu'il possède.
 *
 * `transcriptSourceKey` (nodes audio) : la clé du fichier courant, `null` s'il
 * n'y en a plus. Les chunks `transcript` d'un AUTRE fichier sont supprimés —
 * c'est la seule exception à la règle de propriété, et c'est ce qui invalide
 * un transcript quand l'utilisateur remplace son fichier. `undefined` = ne pas
 * toucher aux transcripts.
 *
 * `transcriptPatches` : titre (et embedding recalculé) des transcripts
 * préservés, quand le titre du node a changé. Un id disparu ou supprimé
 * ci-dessus (re-transcription, fichier remplacé) est ignoré.
 */
export async function upsertChunks(
  ctx: MutationCtx,
  {
    nodeDataId,
    chunks,
    replaceChunkTypes = BUILDER_CHUNK_TYPES,
    transcriptSourceKey,
    transcriptPatches = [],
  }: {
    nodeDataId: Id<"nodeDatas">;
    chunks: ChunkInput[];
    replaceChunkTypes?: ReadonlyArray<ChunkTypeValue>;
    transcriptSourceKey?: string | null;
    transcriptPatches?: TranscriptChunkPatch[];
  },
): Promise<void> {
  const existing = await ctx.db
    .query("searchableChunks")
    .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
    .collect();

  const replaced = new Set<ChunkTypeValue>(replaceChunkTypes);
  const deletedIds = new Set<Id<"searchableChunks">>();

  for (const chunk of existing) {
    const isStaleTranscript =
      chunk.chunkType === "transcript" &&
      transcriptSourceKey !== undefined &&
      getTranscriptSourceKey(chunk.metadata) !== transcriptSourceKey;
    if (replaced.has(chunk.chunkType) || isStaleTranscript) {
      await ctx.db.delete(chunk._id);
      deletedIds.add(chunk._id);
    }
  }

  for (const patch of transcriptPatches) {
    if (deletedIds.has(patch.id)) continue;
    const target = existing.find((chunk) => chunk._id === patch.id);
    // Le patch a été calculé par l'action à partir d'une lecture antérieure :
    // on n'applique que sur un transcript de CE node, encore présent.
    if (!target || target.chunkType !== "transcript") continue;
    await ctx.db.patch(patch.id, {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.embedding !== undefined && {
        embedding: patch.embedding,
        embeddingModel: patch.embeddingModel,
      }),
    });
  }

  for (const chunk of chunks) {
    await ctx.db.insert("searchableChunks", chunk);
  }
}

/**
 * Remplace les chunks `transcript` d'un node — écrit par la transcription,
 * seul propriétaire de ce type. Les autres chunks ne sont pas touchés.
 */
export async function replaceTranscriptChunks(
  ctx: MutationCtx,
  {
    nodeDataId,
    chunks,
  }: {
    nodeDataId: Id<"nodeDatas">;
    chunks: ChunkInput[];
  },
): Promise<void> {
  await upsertChunks(ctx, {
    nodeDataId,
    chunks,
    replaceChunkTypes: ["transcript"],
  });
}

/** Le transcript d'un fichier, prêt à lire : segments découpés par chunk. */
export type CurrentTranscript = {
  model?: string;
  language?: string;
  durationSec?: number;
  overview?: string;
  chunks: Array<{
    order: number;
    startSec: number;
    endSec: number;
    passageTitle?: string;
    summary?: string;
    segments: Array<{ s: number; e: number; text: string }>;
  }>;
};

/**
 * Le transcript du fichier `sourceKey` d'un node, `null` s'il n'y en a pas.
 * Filtré sur la clé : entre le remplacement d'un fichier et le rebuild qui
 * purge l'ancien transcript, celui-ci ne doit être servi à personne.
 */
export async function getCurrentTranscript(
  ctx: QueryCtx,
  {
    nodeDataId,
    sourceKey,
  }: { nodeDataId: Id<"nodeDatas">; sourceKey: string },
): Promise<CurrentTranscript | null> {
  const chunks = (await listTranscriptChunks(ctx, { nodeDataId })).filter(
    (chunk) => chunk.metadata.sourceKey === sourceKey,
  );
  if (chunks.length === 0) return null;

  const first = chunks[0].metadata;
  return {
    model: first.model,
    language: first.language,
    durationSec: first.durationSec,
    ...(first.overview !== undefined && { overview: first.overview }),
    chunks: chunks.map((chunk) => ({
      order: chunk.order,
      startSec: chunk.metadata.startSec,
      endSec: chunk.metadata.endSec,
      ...(chunk.metadata.passageTitle !== undefined && {
        passageTitle: chunk.metadata.passageTitle,
      }),
      ...(chunk.metadata.summary !== undefined && {
        summary: chunk.metadata.summary,
      }),
      segments: splitTranscriptText(chunk.text, chunk.metadata.segments),
    })),
  };
}

/**
 * Écrit les résumés d'un transcript dans la `metadata` de ses chunks — et
 * nulle part ailleurs : ni `text` ni `embedding` ne bougent, donc aucune
 * réindexation, et rien dans `nodeDatas.values`, donc aucun rebuild.
 *
 * Tout ou rien : si le transcript de `sourceKey` n'a plus exactement
 * `passageCount` chunks (re-transcription ou fichier remplacé pendant
 * l'appel LLM), les résumés décrivent autre chose et sont jetés.
 */
export async function patchTranscriptSummaries(
  ctx: MutationCtx,
  {
    nodeDataId,
    sourceKey,
    passageCount,
    overview,
    summaryModel,
    passages,
  }: {
    nodeDataId: Id<"nodeDatas">;
    sourceKey: string;
    passageCount: number;
    overview?: string;
    summaryModel: string;
    passages: Array<{ order: number; title: string; summary: string }>;
  },
): Promise<boolean> {
  const chunks = (await listTranscriptChunks(ctx, { nodeDataId })).filter(
    (chunk) => chunk.metadata.sourceKey === sourceKey,
  );
  if (chunks.length === 0 || chunks.length !== passageCount) return false;

  const byOrder = new Map(passages.map((passage) => [passage.order, passage]));
  for (const chunk of chunks) {
    const passage = byOrder.get(chunk.order);
    const isFirst = chunk.order === chunks[0].order;
    if (!passage && !(isFirst && overview)) continue;

    const existing = await ctx.db.get(chunk._id);
    if (!existing) continue;
    await ctx.db.patch(chunk._id, {
      metadata: {
        ...(existing.metadata ?? {}),
        ...(passage && {
          passageTitle: passage.title,
          summary: passage.summary,
        }),
        ...(isFirst && overview && { overview, summaryModel }),
      },
    });
  }
  return true;
}

/**
 * Existe-t-il un transcript pour ce fichier ? S'arrête au premier chunk
 * trouvé : la toolbar n'a besoin que d'un booléen.
 */
export async function hasTranscript(
  ctx: QueryCtx,
  {
    nodeDataId,
    sourceKey,
  }: { nodeDataId: Id<"nodeDatas">; sourceKey: string },
): Promise<boolean> {
  const chunks = ctx.db
    .query("searchableChunks")
    .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId));
  for await (const chunk of chunks) {
    if (
      chunk.chunkType === "transcript" &&
      getTranscriptSourceKey(chunk.metadata) === sourceKey
    ) {
      return true;
    }
  }
  return false;
}

/** Un chunk `transcript`, projeté sans l'embedding. */
export type TranscriptChunk = {
  _id: Id<"searchableChunks">;
  order: number;
  title: string | undefined;
  text: string;
  metadata: TranscriptChunkMetadata;
};

/**
 * Les chunks `transcript` d'un node, triés par `order`. Ceux dont la metadata
 * est illisible sont écartés (jamais écrits ainsi par la transcription).
 */
export async function listTranscriptChunks(
  ctx: QueryCtx,
  { nodeDataId }: { nodeDataId: Id<"nodeDatas"> },
): Promise<TranscriptChunk[]> {
  const chunks = await ctx.db
    .query("searchableChunks")
    .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
    .collect();

  return chunks
    .flatMap((chunk) => {
      if (chunk.chunkType !== "transcript") return [];
      const metadata = parseTranscriptMetadata(chunk.metadata);
      if (!metadata) return [];
      return [
        {
          _id: chunk._id,
          order: chunk.order,
          title: chunk.title,
          text: chunk.text,
          metadata,
        },
      ];
    })
    .sort((a, b) => a.order - b.order);
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

/**
 * Retire le vecteur d'embedding de chunks (retour au keyword seul).
 * `patch` avec `undefined` supprime le champ optionnel.
 */
export async function stripEmbeddingsByIds(
  ctx: MutationCtx,
  { ids }: { ids: Array<Id<"searchableChunks">> },
): Promise<void> {
  for (const id of ids) {
    await ctx.db.patch(id, {
      embedding: undefined,
      embeddingModel: undefined,
    });
  }
}

/**
 * Résout nodeDataId → llmId pour l'affichage des résultats. Les chunks ne
 * portent plus leur rattachement visuel (cf. searchableChunksSchema) : il se
 * résout ici, à la lecture, via la table `nodes`. Introuvable = orphelin :
 * exclu (avec warn), les contrats de sortie exigent un `nodeId: string`.
 */
export async function resolveNodeIds(
  ctx: QueryCtx,
  {
    canvasId,
    nodeDataIds,
  }: {
    canvasId: Id<"canvases">;
    nodeDataIds: Array<Id<"nodeDatas">>;
  },
): Promise<Map<Id<"nodeDatas">, string>> {
  const resolved = new Map<Id<"nodeDatas">, string>();
  const misses: Array<Id<"nodeDatas">> = [];

  await Promise.all(
    [...new Set(nodeDataIds)].map(async (nodeDataId) => {
      const node = await ctx.db
        .query("nodes")
        .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
        .first();
      // Un node à la corbeille est traité comme un orphelin : ses chunks
      // vivent jusqu'à la purge (30 j), mais il ne doit plus remonter en
      // recherche — ni dans la modale, ni dans le tool `search_canvas`.
      if (node && node.status !== "trashed") {
        resolved.set(nodeDataId, node.id);
      } else {
        misses.push(nodeDataId);
      }
    }),
  );

  for (const nodeDataId of misses) {
    console.warn("[search] resolveNodeIds:orphan-chunk", {
      nodeDataId,
      canvasId,
    });
  }

  return resolved;
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
  startSec?: number;
  endSec?: number;
};

type KeywordSearchResult = {
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

/**
 * Recherche indexée sur le contenu ET le titre, scopée au canvas, dédupliquée.
 * Le type de node est poussé dans l'index quand le fan-out reste raisonnable,
 * et re-filtré en TS dans tous les cas (exact et gratuit).
 * `titleOnly` (recherche utilisateur Cmd+K uniquement) ne touche que l'index
  * `search_title` : le chemin agent (`keywordSearch`) garde le défaut `false`.
 */
export async function searchChunks(
  ctx: QueryCtx,
  {
    canvasId,
    text,
    nodeTypes,
    limit,
    titleOnly,
  }: {
    canvasId: Id<"canvases">;
    text: string;
    nodeTypes?: NodeType[];
    limit: number;
    /** Ne chercher que dans le titre (UI Cmd+K), jamais côté agent. */
    titleOnly?: boolean;
  },
): Promise<SearchableChunk[]> {
  const types = nodeTypes ?? [];
  const indexedTypes: Array<NodeType | undefined> =
    types.length > 0 && types.length <= CHUNK_SEARCH_LIMITS.MAX_INDEXED_NODE_TYPES
      ? types
      : [undefined];
  const onlyTitle = titleOnly === true;

  const batches = await Promise.all(
    indexedTypes.flatMap((nodeType) => {
      const titleQuery = ctx.db
        .query("searchableChunks")
        .withSearchIndex("search_title", (q) => {
          const scoped = q.search("title", text).eq("canvasId", canvasId);
          return nodeType ? scoped.eq("nodeType", nodeType) : scoped;
        })
        .take(limit);
      if (onlyTitle) return [titleQuery];
      const textQuery = ctx.db
        .query("searchableChunks")
        .withSearchIndex("search_text", (q) => {
          const scoped = q.search("text", text).eq("canvasId", canvasId);
          return nodeType ? scoped.eq("nodeType", nodeType) : scoped;
        })
        .take(limit);
      return [textQuery, titleQuery];
    }),
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
    haystacksByNode,
    titleOnly,
  }: {
    canvasId: Id<"canvases">;
    excluded: ExcludedNeedle[];
    /** Clés = nodeDataId (regroupement), pas llmId. */
    haystacksByNode: Map<string, string[]>;
    /** En mode titre-seulement, l'exclusion est jugée sur le titre uniquement. */
    titleOnly?: boolean;
  },
): Promise<Set<string>> {
  const excludedNodeIds = new Set<string>();
  if (excluded.length === 0 || haystacksByNode.size === 0) {
    return excludedNodeIds;
  }

  // 1) Ce qui est déjà chargé : gratuit.
  for (const [nodeKey, haystacks] of haystacksByNode) {
    if (
      excluded.some((needle) =>
        haystacksContainToken(haystacks, needle.normalized),
      )
    ) {
      excludedNodeIds.add(nodeKey);
    }
  }

  // 2) Le reste du node, via l'index.
  const onlyTitle = titleOnly === true;
  const batches = await Promise.all(
    excluded.map(async (needle) => ({
      needle,
      chunks: await searchChunks(ctx, {
        canvasId,
        text: needle.original,
        limit: CHUNK_SEARCH_LIMITS.EXCLUSION_SCAN,
        titleOnly: onlyTitle,
      }),
    })),
  );

  for (const { needle, chunks } of batches) {
    for (const chunk of chunks) {
      const nodeKey = chunk.nodeDataId;
      if (!haystacksByNode.has(nodeKey)) continue;
      if (excludedNodeIds.has(nodeKey)) continue;
      const haystacks = onlyTitle
        ? normalizeHaystacks([chunk.title])
        : normalizeHaystacks([chunk.title, chunk.text]);
      if (haystacksContainToken(haystacks, needle.normalized)) {
        excludedNodeIds.add(nodeKey);
      }
    }
  }

  return excludedNodeIds;
}

export async function keywordSearch(
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
): Promise<KeywordSearchResult> {
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

  // 3bis) Les types invisibles pour l'agent ne remontent jamais ici.
  // Volontairement dans `keywordSearch` et pas dans `searchChunks` : ce
  // dernier sert aussi la recherche de l'utilisateur, où une frame se trouve
  // par son titre comme n'importe quel autre node.
  const visibleChunks = chunks.filter((chunk) =>
    isNodeTypeReadableByAgent(chunk.nodeType),
  );

  // 4) Les contraintes se jugent par node, pas par chunk — regroupés sur
  // nodeDataId (stable, porté par le chunk), pas sur le llmId.
  const haystacksByNode = new Map<string, string[]>();
  for (const chunk of visibleChunks) {
    const normalized = normalizeHaystacks([chunk.title, chunk.text]);
    const existing = haystacksByNode.get(chunk.nodeDataId);
    if (existing) {
      existing.push(...normalized);
    } else {
      haystacksByNode.set(chunk.nodeDataId, normalized);
    }
  }

  const excludedNodeKeys = await collectExcludedNodeIds(ctx, {
    canvasId,
    excluded: parsed.excluded,
    haystacksByNode,
  });

  const kept = visibleChunks.filter(
    (chunk) => !excludedNodeKeys.has(chunk.nodeDataId),
  );
  const strictNodeKeys = new Set(
    Array.from(haystacksByNode.entries())
      .filter(
        ([nodeKey, haystacks]) =>
          !excludedNodeKeys.has(nodeKey) &&
          matchesParsedQuery(haystacks, parsed),
      )
      .map(([nodeKey]) => nodeKey),
  );

  const strict = kept.filter((chunk) => strictNodeKeys.has(chunk.nodeDataId));

  // Le filtrage strict travaille sur une fenêtre bornée : plutôt que de rendre
  // le vide, on élargit en le signalant. Les exclusions restent appliquées.
  const relaxed = strict.length === 0 && kept.length > 0;
  const filtered = relaxed ? kept : strict;

  // 5) Résolution nodeDataId → llmId (une fois, sur les survivants), puis
  // filtre llmId éventuel. Les orphelins irrésolvables sont écartés ici.
  const resolved = await resolveNodeIds(ctx, {
    canvasId,
    nodeDataIds: filtered.map((chunk) => chunk.nodeDataId),
  });

  const nodeIdFilter =
    nodeIds && nodeIds.length > 0 ? new Set(nodeIds) : undefined;

  const addressable = filtered.filter((chunk) => {
    const nodeId = resolved.get(chunk.nodeDataId);
    if (!nodeId) return false;
    return !nodeIdFilter || nodeIdFilter.has(nodeId);
  });

  // 6) Truncate for payload size, then project to the compact response shape.
  // Le contrat de sortie est inchangé (`nodeId: string`) : les appelants
  // (outil agent, mentions) ne voient pas la différence.
  const selected = addressable.slice(0, effectiveLimit);

  // If we had more filtered hits than returned OR we hit the scan cap, signal truncation.
  const truncated =
    addressable.length > effectiveLimit || chunks.length >= scanLimit;

  const hits: FullTextSearchHit[] = [];
  for (const chunk of selected) {
    // Garanti par `addressable` ci-dessus : tous les sélectionnés sont résolus.
    const nodeId = resolved.get(chunk.nodeDataId);
    if (!nodeId) continue;
    hits.push({
      nodeId,
      nodeDataId: chunk.nodeDataId,
      nodeType: chunk.nodeType,
      chunkType: chunk.chunkType,
      order: chunk.order,
      text: stripLoneSurrogates(chunk.text),
      title: chunk.title ? stripLoneSurrogates(chunk.title) : chunk.title,
      page: getPage(chunk.metadata),
      sectionTitle: getSectionTitleFromMetadata(chunk.metadata),
      ...getTimeRangeFromMetadata(chunk.metadata),
    });
  }

  return {
    hits,
    scanned: chunks.length,
    limit: effectiveLimit,
    truncated,
    relaxed,
    terms: parsed.highlightTerms,
  };
}

/**
 * Hydrate des hits `ctx.vectorSearch` (`{_id, _score}`, ordre de pertinence
 * préservé) en documents projetés (sans l'embedding). Applique les filtres
 * que l'index vectoriel ne peut pas pousser (pas de AND inter-champs) :
 * `nodeTypes`, visibilité agent, `nodeIds`, corbeille/orphelins.
 */
export async function hydrateVectorHits(
  ctx: QueryCtx,
  {
    canvasId,
    hits,
    nodeIds,
    nodeTypes,
    agentReadableOnly,
  }: {
    canvasId: Id<"canvases">;
    hits: Array<{ id: Id<"searchableChunks">; score: number }>;
    nodeIds?: string[];
    nodeTypes?: NodeType[];
    agentReadableOnly?: boolean;
  },
): Promise<Array<Omit<FusedHit, "sources">>> {
  const types = nodeTypes ?? [];
  const readableOnly = agentReadableOnly === true;

  const docs = await Promise.all(
    hits.map(async (hit) => ({
      doc: await ctx.db.get(hit.id),
      score: hit.score,
    })),
  );

  const kept = docs.flatMap(({ doc, score }) => {
    if (!doc) return [];
    // Sécurité : le filtre vectoriel est déjà scopé, on re-vérifie ici.
    if (doc.canvasId !== canvasId) return [];
    if (types.length > 0 && !types.includes(doc.nodeType)) return [];
    if (readableOnly && !isNodeTypeReadableByAgent(doc.nodeType)) return [];
    return [{ doc, score }] as const;
  });

  const resolved = await resolveNodeIds(ctx, {
    canvasId,
    nodeDataIds: kept.map(({ doc }) => doc.nodeDataId),
  });

  const nodeIdFilter =
    nodeIds && nodeIds.length > 0 ? new Set(nodeIds) : undefined;

  return kept.flatMap(({ doc, score }) => {
    const nodeId = resolved.get(doc.nodeDataId);
    if (!nodeId) return [];
    if (nodeIdFilter && !nodeIdFilter.has(nodeId)) return [];
    return [
      {
        nodeId,
        nodeDataId: doc.nodeDataId,
        nodeType: doc.nodeType,
        chunkType: doc.chunkType,
        order: doc.order,
        text: stripLoneSurrogates(doc.text),
        title: doc.title ? stripLoneSurrogates(doc.title) : doc.title,
        page: getPage(doc.metadata),
        sectionTitle: getSectionTitleFromMetadata(doc.metadata),
        ...getTimeRangeFromMetadata(doc.metadata),
        imageUrl: getImageUrlFromMetadata(doc.metadata),
        score,
      },
    ];
  });
}
