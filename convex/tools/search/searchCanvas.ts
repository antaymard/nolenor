import { internal } from "../../_generated/api";
import type { NodeType } from "../../schemas/nodeTypeSchema";
import type { FusedHit } from "../../schemas/searchableChunksSchema";
import type { ToolRunCtx } from "../runtime";
import { canReadNode, type ToolScope } from "../scope";

/**
 * Noyau : chercher dans les chunks du canvas (documents, tables, pages de
 * PDF, descriptions d'images, transcripts), en mots-clés, en sémantique, ou
 * les deux fusionnés.
 *
 * Rend les extraits classés, un regroupement par node, et l'état de la
 * recherche (élargie, tronquée, dégradée). Les plafonds d'affichage, la vue
 * compacte et les consignes au modèle sont l'affaire des adaptateurs.
 */

/** Rayon d'un extrait autour du premier terme trouvé, en caractères. */
const SNIPPET_RADIUS = 50;

export type SearchRequest = {
  /** Opérateurs : mots requis, "phrase exacte", -exclu, a OR b. */
  keyword?: string;
  /** Phrases affirmatives, jamais une question. */
  semantic?: string;
  /** Restreindre à ces nodes (en plus du scope). */
  nodeIds?: string[];
  nodeTypes?: NodeType[];
  /** Le nombre de chunks demandé à la recherche (elle plafonne à 50). */
  limit: number;
};

export type SearchHit = FusedHit & { snippet: string };

export type SearchResult = {
  /** Classés par la recherche ; un seul extrait identique par node. */
  hits: SearchHit[];
  /** `keyword`, `semantic` ou `hybrid` : ce qui a réellement tourné. */
  mode: string;
  /** Il restait des résultats au-delà de la limite. */
  truncated: boolean;
  /** Aucun node ne satisfaisait tout : résultats approchés. */
  relaxed: boolean;
  /** La branche sémantique a échoué : mots-clés seuls. */
  degraded: boolean;
};

export async function searchCanvas(
  ctx: ToolRunCtx,
  scope: ToolScope,
  request: SearchRequest,
): Promise<SearchResult> {
  const keyword = request.keyword?.trim() ?? "";
  const semantic = request.semantic?.trim() ?? "";
  const useKeyword = keyword.length > 0;
  const useSemantic = semantic.length > 0;

  // Le scope de lecture borne la recherche elle-même : une liste de nodes
  // vide voudrait dire « pas de filtre » pour elle, d'où la sortie anticipée.
  let nodeIds = request.nodeIds;
  if (scope.read !== "all") {
    const readable = scope.read;
    nodeIds = nodeIds
      ? nodeIds.filter((id) => readable.includes(id))
      : [...readable];
    if (nodeIds.length === 0) {
      return {
        hits: [],
        mode: useKeyword ? (useSemantic ? "hybrid" : "keyword") : "semantic",
        truncated: false,
        relaxed: false,
        degraded: false,
      };
    }
  }

  const result = await ctx.runAction(internal.semanticSearch.runHybridSearch, {
    canvasId: scope.canvasId,
    keywordQuery: useKeyword ? keyword : undefined,
    semanticQuery: useSemantic ? semantic : undefined,
    nodeIds,
    nodeTypes: request.nodeTypes,
    limit: request.limit,
    useKeyword,
    useSemantic,
    agentReadableOnly: true,
  });

  // Centre les extraits sur les termes keyword ; en sémantique pure, sur les
  // mots porteurs de la requête.
  const snippetTerms =
    result.terms.length > 0
      ? result.terms
      : semantic.split(/\s+/).filter((word) => word.length >= 2);
  const hits = result.hits
    .filter((hit) => canReadNode(scope, hit.nodeId))
    .map((hit) => ({ ...hit, snippet: buildSnippet(hit.text, snippetTerms) }));

  // Un même extrait d'un même node n'apparaît qu'une fois (à la place de sa
  // première occurrence).
  const deduped = Array.from(
    new Map(
      hits.map((hit) => [`${hit.nodeId}::${hit.snippet}`, hit] as const),
    ).values(),
  );

  return {
    hits: deduped,
    mode: result.mode,
    truncated: result.truncated,
    relaxed: result.relaxed,
    degraded: result.degraded ?? false,
  };
}

/** Extrait centré sur les mots POSITIFS de la requête (jamais sur `-exclu`). */
export function buildSnippet(text: string, terms: string[]): string {
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

/** Un extrait, sans le node auquel il appartient. */
export type SearchSnippet = {
  snippet: string;
  order: number;
  page?: number;
  sectionTitle?: string;
  startSec?: number;
  endSec?: number;
};

export type SearchNodeGroup = {
  nodeId: string;
  nodeType: string;
  /** Le titre porté par les chunks ; absent sur d'anciens chunks. */
  title?: string;
  hitCount: number;
  bestScore: number;
  /** Dans l'ordre des hits. */
  candidates: SearchSnippet[];
};

/**
 * Les hits regroupés par node, triés par meilleur score puis par nombre de
 * hits : beaucoup de hits faibles ne passent pas devant un hit fort unique.
 */
export function groupByNode(hits: SearchHit[]): SearchNodeGroup[] {
  const grouped = new Map<string, SearchNodeGroup>();
  for (const hit of hits) {
    const candidate: SearchSnippet = {
      snippet: hit.snippet,
      order: hit.order,
      page: hit.page,
      sectionTitle: hit.sectionTitle,
      startSec: hit.startSec,
      endSec: hit.endSec,
    };
    const entry = grouped.get(hit.nodeId);
    if (entry) {
      entry.hitCount += 1;
      if (hit.score > entry.bestScore) entry.bestScore = hit.score;
      if (!entry.title && hit.title) entry.title = hit.title;
      entry.candidates.push(candidate);
    } else {
      grouped.set(hit.nodeId, {
        nodeId: hit.nodeId,
        nodeType: hit.nodeType,
        title: hit.title,
        hitCount: 1,
        bestScore: hit.score,
        candidates: [candidate],
      });
    }
  }
  return Array.from(grouped.values()).sort(
    (a, b) => b.bestScore - a.bestScore || b.hitCount - a.hitCount,
  );
}

/** Les extraits distincts d'un node, dans l'ordre du document. */
export function bestSnippets(
  group: SearchNodeGroup,
  count: number,
): SearchSnippet[] {
  return Array.from(
    new Map(
      group.candidates
        .sort((a, b) => a.order - b.order)
        .map((candidate) => [candidate.snippet, candidate] as const),
    ).values(),
  ).slice(0, count);
}
