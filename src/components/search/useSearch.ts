import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { NodeType } from "@/../convex/schemas/nodeTypeSchema";
import useRichQuery from "@/components/utils/useRichQuery";
import { useDebounce } from "@/hooks/use-debounce";

export type SearchSnippet = {
  snippet: string;
  chunkType: "node" | "page" | "annotation";
  order: number;
  page?: number;
  imageUrl?: string;
  matchStart: number;
  matchEnd: number;
};

export type SearchResult = {
  type: string;
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  title?: string;
  images: Array<{ imageUrl: string; page?: number }>;
  snippets: SearchSnippet[];
};

type SearchPayload = {
  results: SearchResult[];
  /** Aucun node ne satisfaisait toutes les contraintes : résultats élargis. */
  relaxed: boolean;
  /** Mots positifs de la requête, seuls à surligner (jamais `-exclu`). */
  terms: string[];
};

export type RecentEntry = FunctionReturnType<
  typeof api.nodeDatas.listRecentByCanvasId
>[number];

const DEBOUNCE_MS = 300;
const RECENTS_LIMIT = 50;
const EMPTY_PAYLOAD: SearchPayload = { results: [], relaxed: false, terms: [] };

/**
 * Cœur de recherche partagé entre la modale desktop et la sidebar mobile :
 * debounce, filtre de type, requêtes (résultats + récents), rétention des
 * résultats précédents pendant un refetch, et état de navigation clavier.
 */
export function useSearch({
  canvasId,
  query,
  enabled = true,
}: {
  canvasId: Id<"canvases">;
  query: string;
  enabled?: boolean;
}) {
  const debouncedQuery = useDebounce(query.trim(), DEBOUNCE_MS);
  const hasQuery = debouncedQuery.length > 0;

  const [nodeTypes, setNodeTypes] = useState<NodeType[]>([]);

  const toggleNodeType = useCallback((type: NodeType) => {
    setNodeTypes((current) =>
      current.includes(type)
        ? current.filter((entry) => entry !== type)
        : [...current, type],
    );
  }, []);

  const clearNodeTypes = useCallback(() => setNodeTypes([]), []);

  const {
    data: searchData,
    isPending: searchPending,
    error,
  } = useRichQuery(
    api.searchableChunks.search,
    enabled && hasQuery
      ? { query: debouncedQuery, canvasId, nodeTypes }
      : "skip",
  );

  const recents = useQuery(
    api.nodeDatas.listRecentByCanvasId,
    enabled && !hasQuery ? { canvasId, limit: RECENTS_LIMIT } : "skip",
  );

  // On garde les derniers résultats affichés pendant qu'une nouvelle requête
  // est en vol, pour éviter le flash "tout disparaît puis revient".
  const lastPayloadRef = useRef<SearchPayload>(EMPTY_PAYLOAD);
  useEffect(() => {
    if (searchData) lastPayloadRef.current = searchData as SearchPayload;
    if (!hasQuery) lastPayloadRef.current = EMPTY_PAYLOAD;
  }, [searchData, hasQuery]);

  const payload: SearchPayload = hasQuery
    ? ((searchData as SearchPayload | undefined) ?? lastPayloadRef.current)
    : EMPTY_PAYLOAD;

  const results = payload.results;

  const hasPrevious = lastPayloadRef.current.results.length > 0;
  // Premier chargement (aucun résultat à montrer) => skeleton.
  const isInitialLoading = hasQuery
    ? searchPending && !hasPrevious
    : recents === undefined;
  // Refetch alors qu'on a déjà des résultats => on les grise.
  const isStale = hasQuery && searchPending && hasPrevious;

  const navigableCount = hasQuery ? results.length : (recents?.length ?? 0);

  // Navigation clavier.
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, nodeTypes]);
  useEffect(() => {
    setActiveIndex((i) =>
      navigableCount === 0 ? 0 : Math.min(i, navigableCount - 1),
    );
  }, [navigableCount]);

  const move = useCallback(
    (delta: number) => {
      setActiveIndex((i) => {
        if (navigableCount === 0) return 0;
        return Math.min(Math.max(i + delta, 0), navigableCount - 1);
      });
    },
    [navigableCount],
  );

  return {
    debouncedQuery,
    hasQuery,
    results,
    relaxed: payload.relaxed,
    terms: payload.terms,
    recents,
    error,
    isInitialLoading,
    isStale,
    navigableCount,
    activeIndex,
    setActiveIndex,
    move,
    nodeTypes,
    toggleNodeType,
    clearNodeTypes,
  };
}
