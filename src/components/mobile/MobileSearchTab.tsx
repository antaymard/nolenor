import { useMemo, useState, type ReactNode } from "react";
import type { Id } from "@/../convex/_generated/dataModel";
import { Input } from "@/components/shadcn/input";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import { Switch } from "@/components/shadcn/switch";
import {
  SearchDegradedNotice,
  SearchModeToggle,
} from "@/components/search/SearchModeToggle";
import { TbSearch, TbX } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { useWindowsStore } from "@/stores/windowsStore";
import { canNodeTypeBeOpenedInWindow } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import type { NodeType } from "@/types/domain";
import { useSearch, type SearchResult } from "@/components/search/useSearch";
import {
  PreviewImages,
  SearchEmpty,
  SearchError,
  SearchRowHeader,
  SearchSectionLabel,
  SearchSkeleton,
  SearchSnippet,
} from "@/components/search/searchUi";
import { sortSnippets } from "@/components/search/searchUtils";
import { SearchBreadcrumbsProvider } from "@/components/search/SearchBreadcrumbsProvider";
import { SearchTypeFilter } from "@/components/search/SearchTypeFilter";

interface MobileSearchTabProps {
  canvasId: Id<"canvases">;
  /** La requête ne tourne que quand l'onglet est visible. */
  active: boolean;
}

type OpenNodeParams = {
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  nodeType: NodeType | string;
};

export default function MobileSearchTab({
  canvasId,
  active,
}: MobileSearchTabProps) {
  const [query, setQuery] = useState("");
  const openWindow = useWindowsStore((state) => state.openWindow);

  const {
    hasQuery,
    results,
    relaxed,
    terms,
    recents,
    error,
    isInitialLoading,
    isStale,
    nodeTypes,
    toggleNodeType,
    clearNodeTypes,
    titleOnly,
    toggleTitleOnly,
    searchMode,
    setSearchMode,
    degraded,
  } = useSearch({ canvasId, query, enabled: active });

  // Le node s'ouvre en plein écran via MobileNodeOverlay.
  const handleOpenNode = (params: OpenNodeParams) => {
    if (!canNodeTypeBeOpenedInWindow(params.nodeType)) return;
    openWindow({
      xyNodeId: params.nodeId,
      nodeDataId: params.nodeDataId,
      nodeType: params.nodeType as NodeType,
    });
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <TbSearch className="shrink-0 text-muted-foreground" />
        <Input
          type="text"
          aria-label="Search"
          placeholder={
            titleOnly
              ? 'Search titles — "phrase", -exclude, a OR b'
              : searchMode === "semantic"
                ? "Semantic search — describe the idea"
                : 'Search — "phrase", -exclude, a OR b'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border-0 px-0 shadow-none focus-visible:ring-0"
        />
        {isStale ? (
          <Spinner className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
        {query ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label="Clear search"
            onClick={() => setQuery("")}
          >
            <TbX />
          </Button>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
        <SearchTypeFilter
          selected={nodeTypes}
          onToggle={toggleNodeType}
          onClear={clearNodeTypes}
          className="min-w-0 flex-1"
        />
        <SearchModeToggle compact value={searchMode} onChange={setSearchMode} />
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
          <Switch
            checked={titleOnly}
            onCheckedChange={toggleTitleOnly}
            disabled={searchMode !== "keyword"}
            aria-label="Titles only"
          />
          Titles only
        </label>
      </div>
      <div className="flex-1 overflow-y-auto">
        <SearchBreadcrumbsProvider enabled={active}>
          {isInitialLoading ? (
            <SearchSkeleton compact />
          ) : error ? (
            <SearchError message={error.message} />
          ) : hasQuery ? (
            results.length === 0 ? (
              <SearchEmpty icon={<TbSearch />} title="No results" />
            ) : (
              <div
                className={cn(
                  "flex flex-col gap-1 p-2 transition-opacity",
                  isStale && "opacity-60",
                )}
              >
                {relaxed ? (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                    No exact results — showing close matches.
                  </div>
                ) : null}
                {degraded ? <SearchDegradedNotice /> : null}
                <SearchSectionLabel>
                  {results.length} result{results.length > 1 ? "s" : ""}
                </SearchSectionLabel>
                {results.map((result) => (
                  <MobileRow
                    key={result.nodeId}
                    nodeId={result.nodeId}
                    nodeDataId={result.nodeDataId}
                    nodeType={result.type}
                    title={result.title}
                    onOpen={handleOpenNode}
                  >
                    <MobileResultDetails result={result} terms={terms} />
                  </MobileRow>
                ))}
              </div>
            )
          ) : !recents || recents.length === 0 ? (
            <SearchEmpty icon={<TbSearch />} title="No nodes yet" />
          ) : (
            <div className="flex flex-col p-2">
              <SearchSectionLabel>Recent</SearchSectionLabel>
              {recents.map((entry) => (
                <MobileRow
                  key={entry.nodeData._id}
                  nodeId={entry.xyNodeId}
                  nodeDataId={entry.nodeData._id}
                  nodeType={entry.nodeData.type}
                  onOpen={handleOpenNode}
                />
              ))}
            </div>
          )}
        </SearchBreadcrumbsProvider>
      </div>
    </div>
  );
}

function MobileRow({
  nodeId,
  nodeDataId,
  nodeType,
  title,
  onOpen,
  children,
}: OpenNodeParams & {
  title?: string;
  onOpen: (params: OpenNodeParams) => void;
  children?: ReactNode;
}) {
  const canOpen = canNodeTypeBeOpenedInWindow(nodeType);

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => onOpen({ nodeId, nodeDataId, nodeType })}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg px-2 py-2.5 text-left",
        canOpen ? "hover:bg-accent/50" : "opacity-60",
      )}
    >
      <SearchRowHeader
        nodeId={nodeId}
        nodeDataId={nodeDataId}
        nodeType={nodeType}
        title={title}
        compact
      />
      {children}
    </button>
  );
}

function MobileResultDetails({
  result,
  terms,
}: {
  result: SearchResult;
  terms: string[];
}) {
  const sortedSnippets = useMemo(
    () => sortSnippets(result.snippets),
    [result.snippets],
  );
  if (sortedSnippets.length === 0 && result.images.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 pl-[34px]">
      {sortedSnippets.slice(0, 2).map((snippet, index) => (
        <SearchSnippet
          key={`${result.nodeId}-${index}`}
          snippet={snippet}
          terms={terms}
          compact
        />
      ))}
      <PreviewImages images={result.images} size="h-20 w-20" />
    </div>
  );
}
