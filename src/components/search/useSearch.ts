import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type {
  GroupedSearchResult,
  SearchSnippetValue,
} from "@/../convex/schemas/searchableChunksSchema";
import type { NodeType } from "@/../convex/schemas/nodeTypeSchema";
import useRichQuery from "@/components/utils/useRichQuery";
import { useDebounce } from "@/hooks/use-debounce";

export type SearchSnippet = SearchSnippetValue;

export type SearchResult = GroupedSearchResult;

/** keyword = full-text réactif ; auto = hybride RRF ; semantic = vectoriel pur. */
export type SearchMode = "keyword" | "auto" | "semantic";

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
const SEARCH_MODE_STORAGE_KEY = "entropie:search-mode";
const EMPTY_PAYLOAD: SearchPayload = { results: [], relaxed: false, terms: [] };

function loadSearchMode(): SearchMode {
  try {
    const stored = localStorage.getItem(SEARCH_MODE_STORAGE_KEY);
    return stored === "keyword" || stored === "semantic" ? stored : "auto";
  } catch {
    return "auto";
  }
}

/**
 * Cœur de recherche partagé entre la modale desktop et la sidebar mobile :
 * debounce, filtre de type, requêtes (résultats + récents), rétention des
 * résultats précédents pendant un refetch, et état de navigation clavier.
 *
 * Mode keyword : query réactive existante. Modes auto/semantic : action
 * `api.semanticSearch.search` (le vectorSearch n'existe qu'en action).
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
  // Mode "titre seulement" (keyword uniquement, jamais côté agent).
  const [titleOnly, setTitleOnly] = useState(false);
  const [searchMode, setSearchModeState] = useState<SearchMode>(loadSearchMode);

  const setSearchMode = useCallback((mode: SearchMode) => {
    setSearchModeState(mode);
    try {
      localStorage.setItem(SEARCH_MODE_STORAGE_KEY, mode);
    } catch {
      // Stockage indisponible (navigation privée) : mode en mémoire seulement.
    }
  }, []);

  const toggleNodeType = useCallback((type: NodeType) => {
    setNodeTypes((current) =>
      current.includes(type)
        ? current.filter((entry) => entry !== type)
        : [...current, type],
    );
  }, []);

  const clearNodeTypes = useCallback(() => setNodeTypes([]), []);

  const toggleTitleOnly = useCallback(() => {
    setTitleOnly((current) => !current);
  }, []);

  const useVector = searchMode !== "keyword";

  const {
    data: searchData,
    isPending: searchPending,
    error: searchError,
  } = useRichQuery(
    api.searchableChunks.search,
    enabled && hasQuery && !useVector
      ? {
          query: debouncedQuery,
          canvasId,
          nodeTypes,
          ...(titleOnly ? { titleOnly: true } : {}),
        }
      : "skip",
  );

  const runVectorSearch = useAction(api.semanticSearch.search);
  const [vectorData, setVectorData] = useState<SearchPayload | undefined>(
    undefined,
  );
  const [vectorPending, setVectorPending] = useState(false);
  const [vectorError, setVectorError] = useState<Error | undefined>(undefined);
  const [degraded, setDegraded] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!(enabled && hasQuery && useVector)) {
      setVectorData(undefined);
      setVectorError(undefined);
      setVectorPending(false);
      setDegraded(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    setVectorPending(true);
    setVectorError(undefined);
    runVectorSearch({
      query: debouncedQuery,
      canvasId,
      nodeTypes,
      mode: searchMode === "semantic" ? "semantic" : "hybrid",
    }).then(
      (data) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setVectorData(data);
        setDegraded(data.degraded);
        setVectorPending(false);
      },
      (error: unknown) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        // Erreur propre : le détail brut (clé manquante, quota, 429…) reste
        // dans la console, l'utilisateur voit un message actionnable.
        console.warn("[useSearch] vector search failed", error);
        setVectorError(
          new Error(
            "Semantic search is unavailable right now — keyword mode still works.",
          ),
        );
        setVectorPending(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    hasQuery,
    useVector,
    debouncedQuery,
    canvasId,
    nodeTypes,
    searchMode,
    runVectorSearch,
  ]);

  const recents = useQuery(
    api.nodeDatas.listRecentByCanvasId,
    enabled && !hasQuery ? { canvasId, limit: RECENTS_LIMIT } : "skip",
  );

  const liveData = useVector
    ? vectorData
    : (searchData as SearchPayload | undefined);
  const isPending = useVector ? vectorPending : searchPending;
  const error = useVector ? vectorError : searchError;

  // On garde les derniers résultats affichés pendant qu'une nouvelle requête
  // est en vol, pour éviter le flash "tout disparaît puis revient".
  const lastPayloadRef = useRef<SearchPayload>(EMPTY_PAYLOAD);
  useEffect(() => {
    if (liveData) lastPayloadRef.current = liveData;
    if (!hasQuery) lastPayloadRef.current = EMPTY_PAYLOAD;
  }, [liveData, hasQuery]);

  const payload: SearchPayload = hasQuery
    ? (liveData ?? lastPayloadRef.current)
    : EMPTY_PAYLOAD;

  const results = payload.results;

  const hasPrevious = lastPayloadRef.current.results.length > 0;
  // Premier chargement (aucun résultat à montrer) => skeleton.
  const isInitialLoading = hasQuery
    ? isPending && !hasPrevious
    : recents === undefined;
  // Refetch alors qu'on a déjà des résultats => on les grise.
  const isStale = hasQuery && isPending && hasPrevious;

  const navigableCount = hasQuery ? results.length : (recents?.length ?? 0);

  // Navigation clavier.
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, nodeTypes, titleOnly, searchMode]);
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
    titleOnly: titleOnly && !useVector,
    toggleTitleOnly,
    setTitleOnly,
    searchMode,
    setSearchMode,
    /** Branche sémantique indisponible : repli keyword seul. */
    degraded: useVector && degraded,
  };
}
