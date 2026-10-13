import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Spinner } from "@/components/shadcn/spinner";
import { Switch } from "@/components/shadcn/switch";
import {
  SearchDegradedNotice,
  SearchModeToggle,
} from "@/components/search/SearchModeToggle";
import { Kbd, KbdGroup } from "@/components/shadcn/kbd";
import { cn } from "@/lib/utils";
import { fromXyNodeToCanvasNode } from "@/lib/node-types-converter";
import type { Id } from "@/types";
import { useParams } from "@tanstack/react-router";
import { useReactFlow } from "@xyflow/react";
import {
  OPEN_MODIFIER_LABEL,
  isOpenModifier,
  useActivateNode,
} from "@/hooks/useActivateNode";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { TbSearch, TbX } from "react-icons/tb";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useCanvasStore } from "@/stores/canvasStore";
import { useIsNodeAttached, useNoleStore } from "@/stores/noleStore";
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

export default function SearchModale() {
  const isOpen = useCanvasStore((state) => state.isSearchModalOpen);
  const searchQuery = useCanvasStore((state) => state.searchQuery);
  const toggleSearchModal = useCanvasStore((state) => state.toggleSearchModal);
  const closeSearchModal = useCanvasStore((state) => state.closeSearchModal);
  const setSearchQuery = useCanvasStore((state) => state.setSearchQuery);
  const { getNode } = useReactFlow();
  const activateNode = useActivateNode();
  const addAttachments = useNoleStore((state) => state.addAttachments);
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });
  useHotkey("Mod+K", () => toggleSearchModal());

  const {
    debouncedQuery,
    hasQuery,
    results,
    relaxed,
    terms,
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
    titleOnly,
    toggleTitleOnly,
    searchMode,
    setSearchMode,
    degraded,
  } = useSearch({ canvasId, query: searchQuery, enabled: isOpen });

  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-opt-${index}`;
  const activeDescendant =
    navigableCount > 0 ? optionId(activeIndex) : undefined;

  const resultsContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = resultsContainerRef.current?.querySelector(
      '[data-active="true"]',
    );
    if (active instanceof HTMLElement)
      active.scrollIntoView({ block: "nearest" });
  }, [activeIndex, navigableCount]);

  // Default: go to the node. Cmd/Ctrl: open its window (falls back to go to
  // when the node has none).
  const handleActivate = useCallback(
    (
      params: {
        nodeId: string;
        nodeDataId: Id<"nodeDatas">;
        nodeType: string;
      },
      open: boolean,
    ) => {
      activateNode(params, { open });
      closeSearchModal();
    },
    [activateNode, closeSearchModal],
  );

  const handleToggleAttachment = useCallback(
    (nodeId: string) => {
      const xyNode = getNode(nodeId);
      if (!xyNode) return;
      addAttachments({ nodes: [fromXyNodeToCanvasNode(xyNode)] }, true);
    },
    [addAttachments, getNode],
  );

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const open = isOpenModifier(event);
      if (hasQuery) {
        const selected = results[activeIndex];
        if (selected) {
          handleActivate(
            {
              nodeId: selected.nodeId,
              nodeDataId: selected.nodeDataId,
              nodeType: selected.type,
            },
            open,
          );
        }
      } else {
        const selected = recents?.[activeIndex];
        if (selected) {
          handleActivate(
            {
              nodeId: selected.xyNodeId,
              nodeDataId: selected.nodeData._id,
              nodeType: selected.nodeData.type,
            },
            open,
          );
        }
      }
    }
  };

  const resultCount = results.length;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeSearchModal();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[85vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-surface/40 p-0 shadow-[0_6px_20px_rgba(15,23,42,0.12)] sm:h-[75vh] sm:max-w-3xl md:max-w-4xl"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search nodes, documents and canvas contents.
        </DialogDescription>

        {/* Search field */}
        <div className="flex h-12 items-center gap-2 border-b px-4">
          <TbSearch size={17} className="shrink-0 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listboxId}
            aria-activedescendant={activeDescendant}
            aria-label="Search"
            placeholder={
              titleOnly
                ? 'Search titles — "exact phrase", -exclude, a OR b'
                : searchMode === "semantic"
                  ? "Semantic search — describe the idea in your own words"
                  : 'Search — "exact phrase", -exclude, a OR b'
            }
            className="min-w-0 flex-1 border-none bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          {isStale ? (
            <Spinner className="size-4 shrink-0 text-muted-foreground" />
          ) : null}
          {searchQuery ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Clear search"
              onClick={() => setSearchQuery("")}
            >
              <TbX />
            </Button>
          ) : null}
          <label
            className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none"
            title={
              searchMode === "keyword"
                ? "Ne chercher que dans les titres"
                : "Disponible en mode Keyword uniquement"
            }
            // Keep focus in the input: keyboard navigation depends on it.
            onMouseDown={(event) => event.preventDefault()}
          >
            <Switch
              checked={titleOnly}
              onCheckedChange={toggleTitleOnly}
              disabled={searchMode !== "keyword"}
              aria-label="Titles only"
            />
            Titles only
          </label>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label="Close"
            onClick={() => closeSearchModal()}
          >
            <TbX />
          </Button>
        </div>

        {/* Type filters + search mode */}
        <div className="flex items-center gap-3 border-b border-slate-200/70 bg-slate-50/60 px-4 py-2">
          <SearchTypeFilter
            selected={nodeTypes}
            onToggle={toggleNodeType}
            onClear={clearNodeTypes}
            className="min-w-0 flex-1"
          />
          <SearchModeToggle value={searchMode} onChange={setSearchMode} />
        </div>

        {/* Screen reader announcement */}
        <div aria-live="polite" className="sr-only">
          {isInitialLoading
            ? "Searching"
            : hasQuery
              ? `${resultCount} result${resultCount > 1 ? "s" : ""}`
              : ""}
        </div>

        {/* Results */}
        <div
          ref={resultsContainerRef}
          role="listbox"
          id={listboxId}
          aria-label="Search results"
          className={cn(
            "flex-1 overflow-auto p-2 transition-opacity",
            isStale && "opacity-60",
          )}
        >
          <SearchBreadcrumbsProvider>
            {isInitialLoading ? (
              <SearchSkeleton />
            ) : error ? (
              <SearchError message={error.message} />
            ) : hasQuery ? (
              results.length === 0 ? (
                <SearchEmpty
                  icon={<TbSearch />}
                  title="No results"
                  description={`No matches for "${debouncedQuery}".`}
                />
              ) : (
                <>
                  {relaxed ? (
                    <div className="mx-1 mt-1 mb-2 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                      No exact results — showing close matches.
                    </div>
                  ) : null}
                  {degraded ? (
                    <SearchDegradedNotice className="mx-1 mt-1 mb-2" />
                  ) : null}
                  <SearchSectionLabel>
                    {resultCount} result{resultCount > 1 ? "s" : ""}
                  </SearchSectionLabel>
                  {results.map((result, idx) => (
                    <SearchRow
                      key={result.nodeId}
                      optionId={optionId(idx)}
                      nodeId={result.nodeId}
                      nodeDataId={result.nodeDataId}
                      nodeType={result.type}
                      title={result.title}
                      active={idx === activeIndex}
                      onSelect={() => setActiveIndex(idx)}
                      onActivate={handleActivate}
                      onToggleAttachment={handleToggleAttachment}
                    >
                      <ResultDetails result={result} terms={terms} />
                    </SearchRow>
                  ))}
                </>
              )
            ) : !recents || recents.length === 0 ? (
              <SearchEmpty icon={<TbSearch />} title="No nodes yet" />
            ) : (
              <>
                <SearchSectionLabel>Recent</SearchSectionLabel>
                {recents.map((entry, idx) => (
                  <SearchRow
                    key={entry.nodeData._id}
                    optionId={optionId(idx)}
                    nodeId={entry.xyNodeId}
                    nodeDataId={entry.nodeData._id}
                    nodeType={entry.nodeData.type}
                    active={idx === activeIndex}
                    onSelect={() => setActiveIndex(idx)}
                    onActivate={handleActivate}
                    onToggleAttachment={handleToggleAttachment}
                  />
                ))}
              </>
            )}
          </SearchBreadcrumbsProvider>
        </div>

        {/* Shortcuts footer */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200/70 bg-slate-50/60 px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <KbdGroup>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </KbdGroup>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            go to
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>{OPEN_MODIFIER_LABEL}</Kbd>+<Kbd>↵</Kbd>
            open window
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Kbd>Alt</Kbd>+click to attach to Nole
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ActivateParams = {
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  nodeType: string;
};

/**
 * Une ligne de la liste, identique qu'on cherche ou qu'on parcoure les
 * récents : seuls les détails (extraits, aperçus) s'ajoutent en `children`.
 */
function SearchRow({
  optionId,
  nodeId,
  nodeDataId,
  nodeType,
  title,
  active,
  onSelect,
  onActivate,
  onToggleAttachment,
  children,
}: ActivateParams & {
  optionId: string;
  title?: string;
  active: boolean;
  onSelect: () => void;
  onActivate: (params: ActivateParams, open: boolean) => void;
  onToggleAttachment: (nodeId: string) => void;
  children?: ReactNode;
}) {
  const isAttachedToNole = useIsNodeAttached(nodeId);

  return (
    <div
      id={optionId}
      role="option"
      aria-selected={active}
      data-active={active ? "true" : undefined}
      className={cn(
        "relative flex cursor-pointer flex-col gap-2 rounded-xl px-3 py-2.5 transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50",
        isAttachedToNole &&
          "after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:border-2 after:border-dashed after:border-violet-500/90",
      )}
      onMouseEnter={onSelect}
      onClick={(event) => {
        if (event.altKey) {
          event.preventDefault();
          onToggleAttachment(nodeId);
          return;
        }
        onActivate({ nodeId, nodeDataId, nodeType }, isOpenModifier(event));
      }}
      title={
        isAttachedToNole
          ? "Alt+click to detach from Nole"
          : "Alt+click to attach to Nole"
      }
    >
      <SearchRowHeader
        nodeId={nodeId}
        nodeDataId={nodeDataId}
        nodeType={nodeType}
        title={title}
      />
      {children}
    </div>
  );
}

/** Extraits et aperçus d'un résultat, alignés sous le titre. */
function ResultDetails({
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
    <div className="flex flex-col gap-1.5 pl-[38px]">
      {sortedSnippets.map((snippet, index) => (
        <SearchSnippet
          key={`${result.nodeId}-${snippet.order}-${index}`}
          snippet={snippet}
          terms={terms}
        />
      ))}
      <PreviewImages images={result.images} size="h-24 w-24" />
    </div>
  );
}
