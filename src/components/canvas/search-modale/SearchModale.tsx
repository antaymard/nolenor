import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Spinner } from "@/components/shadcn/spinner";
import { Kbd, KbdGroup } from "@/components/shadcn/kbd";
import { cn } from "@/lib/utils";
import { fromXyNodeToCanvasNode } from "@/lib/node-types-converter";
import type { Id } from "@/types";
import type { NodeType } from "@/types/domain";
import { useParams } from "@tanstack/react-router";
import { useReactFlow } from "@xyflow/react";
import { useGoToNode } from "@/hooks/useGoToNode";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type KeyboardEvent,
} from "react";
import { TbLocation, TbSearch, TbX } from "react-icons/tb";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { useCanvasStore } from "@/stores/canvasStore";
import { useIsNodeAttached, useNoleStore } from "@/stores/noleStore";
import { useWindowsStore } from "@/stores/windowsStore";
import { canNodeTypeBeOpenedInWindow } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { useSearch, type SearchResult } from "@/components/search/useSearch";
import {
  PreviewImages,
  SearchEmpty,
  SearchError,
  SearchSkeleton,
  SearchSnippet,
} from "@/components/search/searchUi";
import { formatRelative, sortSnippets } from "@/components/search/searchUtils";

export default function SearchModale() {
  const isOpen = useCanvasStore((state) => state.isSearchModalOpen);
  const searchQuery = useCanvasStore((state) => state.searchQuery);
  const toggleSearchModal = useCanvasStore((state) => state.toggleSearchModal);
  const closeSearchModal = useCanvasStore((state) => state.closeSearchModal);
  const setSearchQuery = useCanvasStore((state) => state.setSearchQuery);
  const { getNode } = useReactFlow();
  const openWindow = useWindowsStore((state) => state.openWindow);
  const addAttachments = useNoleStore((state) => state.addAttachments);
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });
  useHotkey("Mod+K", () => toggleSearchModal());

  const {
    debouncedQuery,
    hasQuery,
    results,
    recents,
    error,
    isInitialLoading,
    isStale,
    navigableCount,
    activeIndex,
    setActiveIndex,
    move,
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
    if (active instanceof HTMLElement) active.scrollIntoView({ block: "nearest" });
  }, [activeIndex, navigableCount]);

  const handleOpenResult = useCallback(
    (result: SearchResult) => {
      if (!canNodeTypeBeOpenedInWindow(result.type)) return;
      openWindow({
        xyNodeId: result.nodeId,
        nodeDataId: result.nodeDataId,
        nodeType: result.type as NodeType,
      });
      closeSearchModal();
    },
    [closeSearchModal, openWindow],
  );

  const handleOpenNode = useCallback(
    (params: {
      nodeId: string;
      nodeDataId: Id<"nodeDatas">;
      nodeType: string;
    }) => {
      if (!canNodeTypeBeOpenedInWindow(params.nodeType)) return;
      openWindow({
        xyNodeId: params.nodeId,
        nodeDataId: params.nodeDataId,
        nodeType: params.nodeType as NodeType,
      });
      closeSearchModal();
    },
    [closeSearchModal, openWindow],
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
      if (hasQuery) {
        const selected = results[activeIndex];
        if (selected) handleOpenResult(selected);
      } else {
        const selected = recents?.[activeIndex];
        if (selected) {
          handleOpenNode({
            nodeId: selected.xyNodeId,
            nodeDataId: selected.nodeData._id,
            nodeType: selected.nodeData.type,
          });
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
        className="flex h-[85vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:h-[75vh] sm:max-w-3xl md:max-w-4xl"
      >
        <DialogTitle className="sr-only">Recherche</DialogTitle>
        <DialogDescription className="sr-only">
          Rechercher des nodes, documents et contenus du canvas.
        </DialogDescription>

        {/* Champ de recherche */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <TbSearch className="shrink-0 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listboxId}
            aria-activedescendant={activeDescendant}
            aria-label="Rechercher"
            placeholder="Rechercher des nodes, documents…"
            className="min-w-0 flex-1 border-none bg-transparent outline-none placeholder:text-muted-foreground"
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
              aria-label="Effacer la recherche"
              onClick={() => setSearchQuery("")}
            >
              <TbX />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label="Fermer"
            onClick={() => closeSearchModal()}
          >
            <TbX />
          </Button>
        </div>

        {/* Annonce lecteur d'écran */}
        <div aria-live="polite" className="sr-only">
          {isInitialLoading
            ? "Recherche en cours"
            : hasQuery
              ? `${resultCount} résultat${resultCount > 1 ? "s" : ""}`
              : ""}
        </div>

        {/* Résultats */}
        <div
          ref={resultsContainerRef}
          role="listbox"
          id={listboxId}
          aria-label="Résultats de recherche"
          className={cn(
            "flex-1 overflow-auto p-1 transition-opacity",
            isStale && "opacity-60",
          )}
        >
          {isInitialLoading ? (
            <SearchSkeleton />
          ) : error ? (
            <SearchError message={error.message} />
          ) : hasQuery ? (
            results.length === 0 ? (
              <SearchEmpty
                icon={<TbSearch />}
                title="Aucun résultat"
                description={`Aucune correspondance pour « ${debouncedQuery} ».`}
              />
            ) : (
              <>
                <div className="px-2 pt-1 pb-2 text-xs uppercase tracking-wider text-muted-foreground">
                  {resultCount} résultat{resultCount > 1 ? "s" : ""}
                </div>
                {results.map((result, idx) => (
                  <ResultCard
                    key={result.nodeId}
                    optionId={optionId(idx)}
                    result={result}
                    query={debouncedQuery}
                    active={idx === activeIndex}
                    onSelect={() => setActiveIndex(idx)}
                    onOpen={() => handleOpenResult(result)}
                    onToggleAttachment={() =>
                      handleToggleAttachment(result.nodeId)
                    }
                  />
                ))}
              </>
            )
          ) : !recents || recents.length === 0 ? (
            <SearchEmpty
              icon={<TbSearch />}
              title="Aucun node pour l'instant"
            />
          ) : (
            <>
              <h4 className="px-2 pt-1 pb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Récents
              </h4>
              {recents.map((entry, idx) => (
                <RecentRow
                  key={entry.nodeData._id}
                  optionId={optionId(idx)}
                  nodeId={entry.xyNodeId}
                  nodeDataId={entry.nodeData._id}
                  nodeType={entry.nodeData.type}
                  updatedAt={entry.nodeData.updatedAt}
                  active={idx === activeIndex}
                  onSelect={() => setActiveIndex(idx)}
                  onOpen={handleOpenNode}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer raccourcis */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <KbdGroup>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </KbdGroup>
            naviguer
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            ouvrir
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Kbd>Alt</Kbd>+ clic attacher à Nole
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            fermer
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultCard({
  optionId,
  result,
  query,
  active,
  onSelect,
  onOpen,
  onToggleAttachment,
}: {
  optionId: string;
  result: SearchResult;
  query: string;
  active: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onToggleAttachment: () => void;
}) {
  const fallbackTitle = useNodeDataTitle(result.nodeDataId);
  const nodeTitle = result.title ?? fallbackTitle;
  const closeSearchModal = useCanvasStore((state) => state.closeSearchModal);
  const goToNode = useGoToNode();
  const isAttachedToNole = useIsNodeAttached(result.nodeId);
  const canOpenWindow = canNodeTypeBeOpenedInWindow(result.type);
  const sortedSnippets = useMemo(
    () => sortSnippets(result.snippets),
    [result.snippets],
  );

  const handleGoToNode = () => {
    goToNode(result.nodeId);
    closeSearchModal();
  };

  return (
    <div
      id={optionId}
      role="option"
      aria-selected={active}
      data-active={active ? "true" : undefined}
      className={cn(
        "relative flex cursor-pointer flex-col rounded p-3 transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50",
        isAttachedToNole &&
          "after:pointer-events-none after:absolute after:-inset-1 after:rounded-[8px] after:border-2 after:border-dashed after:border-violet-500/90",
      )}
      onMouseEnter={onSelect}
      onClick={(event) => {
        if (event.altKey) {
          event.preventDefault();
          onToggleAttachment();
          return;
        }
        if (canOpenWindow) onOpen();
      }}
      title={
        isAttachedToNole
          ? "Alt+clic pour détacher de Nole"
          : "Alt+clic pour attacher à Nole"
      }
    >
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          className="h-7 w-7"
          onClick={(event) => {
            event.stopPropagation();
            handleGoToNode();
          }}
          aria-label="Localiser sur le canvas"
          title="Localiser sur le canvas"
        >
          <TbLocation size={14} />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 pr-16">
        <p className="text-lg font-bold">{nodeTitle}</p>
        <span className="rounded-sm bg-muted px-1 text-sm text-muted-foreground">
          {result.type}
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {sortedSnippets.length === 0 ? (
          <span className="text-sm text-muted-foreground">Aucun extrait</span>
        ) : (
          sortedSnippets.map((snippet, index) => (
            <SearchSnippet
              key={`${result.nodeId}-${snippet.order}-${index}`}
              snippet={snippet}
              query={query}
            />
          ))
        )}
      </div>

      <div className="mt-2">
        <PreviewImages images={result.images} size="h-28 w-28" />
      </div>
    </div>
  );
}

function RecentRow({
  optionId,
  nodeId,
  nodeDataId,
  nodeType,
  updatedAt,
  active,
  onSelect,
  onOpen,
}: {
  optionId: string;
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  nodeType: string;
  updatedAt?: number;
  active: boolean;
  onSelect: () => void;
  onOpen: (params: {
    nodeId: string;
    nodeDataId: Id<"nodeDatas">;
    nodeType: string;
  }) => void;
}) {
  const title = useNodeDataTitle(nodeDataId);
  const Icon = getNodeIcon(nodeType);
  const canOpen = canNodeTypeBeOpenedInWindow(nodeType);

  return (
    <div
      id={optionId}
      role="option"
      aria-selected={active}
      aria-disabled={!canOpen || undefined}
      data-active={active ? "true" : undefined}
      onMouseEnter={onSelect}
      onClick={() => {
        if (canOpen) onOpen({ nodeId, nodeDataId, nodeType });
      }}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50",
        canOpen ? "cursor-pointer" : "cursor-default opacity-50",
      )}
    >
      {Icon ? (
        <Icon size={14} className="shrink-0 text-muted-foreground" />
      ) : null}
      <span className="min-w-0 flex-1 truncate text-sm">
        {title || nodeType}
      </span>
      <span className="shrink-0 rounded bg-muted px-1.5 text-xs text-muted-foreground">
        {nodeType}
      </span>
      {updatedAt ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatRelative(updatedAt)}
        </span>
      ) : null}
    </div>
  );
}
