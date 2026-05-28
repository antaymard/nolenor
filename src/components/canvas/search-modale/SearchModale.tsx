import { Button } from "@/components/shadcn/button";
import useRichQuery from "@/components/utils/useRichQuery";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { fromXyNodeToCanvasNode } from "@/lib/node-types-converter";
import type { Id } from "@/types";
import type { NodeType } from "@/types/domain";
import { useParams } from "@tanstack/react-router";
import { useReactFlow } from "@xyflow/react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TbLocation, TbSearch, TbX } from "react-icons/tb";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { useCanvasStore } from "@/stores/canvasStore";
import { useIsNodeAttached, useNoleStore } from "@/stores/noleStore";
import { useWindowsStore } from "@/stores/windowsStore";
import { canNodeTypeBeOpenedInWindow } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";

type SearchResult = {
  type: string;
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  title?: string;
  images: Array<{
    imageUrl: string;
    page?: number;
  }>;
  snippets: Array<{
    snippet: string;
    chunkType: "node" | "page" | "annotation";
    order: number;
    page?: number;
    imageUrl?: string;
    matchStart: number;
    matchEnd: number;
  }>;
};

export default function SearchModale() {
  const isOpen = useCanvasStore((state) => state.isSearchModalOpen);
  const searchQuery = useCanvasStore((state) => state.searchQuery);
  const toggleSearchModal = useCanvasStore((state) => state.toggleSearchModal);
  const closeSearchModal = useCanvasStore((state) => state.closeSearchModal);
  const setSearchQuery = useCanvasStore((state) => state.setSearchQuery);
  const debouncedSearchQuery = useDebounce(searchQuery.trim(), 300);
  const { getNode } = useReactFlow();
  const openWindow = useWindowsStore((state) => state.openWindow);
  const addAttachments = useNoleStore((state) => state.addAttachments);
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });
  useHotkey("Mod+K", () => toggleSearchModal());
  useHotkey("Escape", () => closeSearchModal(), { enabled: isOpen });

  const hasQuery = debouncedSearchQuery.length > 0;

  const {
    data: searchResults,
    isPending: isSearchPending,
    error,
  } = useRichQuery(
    api.searchableChunks.search,
    hasQuery ? { query: debouncedSearchQuery, canvasId } : "skip",
  );
  const results = useMemo(() => searchResults ?? [], [searchResults]);

  const recents = useQuery(
    api.nodeDatas.listRecentByCanvasId,
    hasQuery ? "skip" : { canvasId, limit: 50 },
  );

  const isPending = hasQuery ? isSearchPending : recents === undefined;

  // Keyboard navigation state
  const [selectedIndex, setSelectedIndex] = useState(0);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  const handleOpenResultWindow = useCallback(
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

  const handleToggleResultAttachment = useCallback(
    (nodeId: string) => {
      const xyNode = getNode(nodeId);
      if (!xyNode) return;

      addAttachments({ nodes: [fromXyNodeToCanvasNode(xyNode)] }, true);
    },
    [addAttachments, getNode],
  );

  const navigableCount = hasQuery ? results.length : recents?.length ?? 0;

  // Reset selection when results change or modal opens
  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedSearchQuery, isOpen]);

  useEffect(() => {
    setSelectedIndex((currentIndex) => {
      if (navigableCount === 0) return 0;
      return Math.min(currentIndex, navigableCount - 1);
    });
  }, [navigableCount]);

  // Scroll selected item into view
  useEffect(() => {
    if (!resultsContainerRef.current) return;
    const selected = resultsContainerRef.current.querySelector(
      '[data-selected="true"]',
    );
    if (selected && selected instanceof HTMLElement) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, navigableCount]);

  if (!isOpen) return null;
  return (
    <div
      className="inset-0 animate-in flex items-center justify-center fixed z-50"
      onClick={() => closeSearchModal()}
    >
      <div
        className="canvas-ui-container shadow-xl w-full max-w-none sm:max-w-3xl md:max-w-4xl flex-col h-[85vh] sm:h-3/4 rounded-none sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex gap-2 items-center justify-between w-full border-b py-1">
          <div className="flex gap-2 items-center px-2 w-full ">
            <TbSearch />
            <input
              autoFocus
              type="text"
              placeholder="Search for nodes, templates, etc..."
              className="bg-transparent outline-none border-none flex-1"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (isPending || error || navigableCount === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSelectedIndex((i) => Math.min(i + 1, navigableCount - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSelectedIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (hasQuery) {
                    const selected = results[selectedIndex];
                    if (selected) handleOpenResultWindow(selected);
                  } else {
                    const selected = recents?.[selectedIndex];
                    if (selected) {
                      handleOpenNode({
                        nodeId: selected.xyNodeId,
                        nodeDataId: selected.nodeData._id,
                        nodeType: selected.nodeData.type,
                      });
                    }
                  }
                }
              }}
            />
          </div>

          <Button variant="ghost" size="sm" onClick={() => closeSearchModal()}>
            <TbX />
          </Button>
        </div>

        {/* Body */}
        {isPending ? (
          <div>Loading...</div>
        ) : error ? (
          <div>Error: {error.message}</div>
        ) : (
          <div
            className="flex flex-col gap-2 w-full h-full overflow-auto p-1"
            ref={resultsContainerRef}
          >
            {hasQuery ? (
              results.length === 0 ? (
                <div>No results found</div>
              ) : (
                results.map((result, idx) => (
                  <ResultCard
                    key={result.nodeId}
                    result={result}
                    query={debouncedSearchQuery}
                    selected={idx === selectedIndex}
                    onSelect={() => setSelectedIndex(idx)}
                    onOpenWindow={() => handleOpenResultWindow(result)}
                    onToggleAttachment={() =>
                      handleToggleResultAttachment(result.nodeId)
                    }
                  />
                ))
              )
            ) : !recents || recents.length === 0 ? (
              <div>No nodes yet</div>
            ) : (
              <>
                <h4 className="px-2 pt-1 text-xs uppercase tracking-wider text-muted-foreground">
                  Recent
                </h4>
                {recents.map((entry, idx) => (
                  <RecentRow
                    key={entry.nodeData._id}
                    nodeId={entry.xyNodeId}
                    nodeDataId={entry.nodeData._id}
                    nodeType={entry.nodeData.type}
                    updatedAt={entry.nodeData.updatedAt}
                    selected={idx === selectedIndex}
                    onSelect={() => setSelectedIndex(idx)}
                    onOpen={handleOpenNode}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  result,
  query,
  selected = false,
  onSelect,
  onOpenWindow,
  onToggleAttachment,
}: {
  result: SearchResult;
  query: string;
  selected?: boolean;
  onSelect: () => void;
  onOpenWindow: () => void;
  onToggleAttachment: () => void;
}) {
  const fallbackTitle = useNodeDataTitle(result.nodeDataId);
  const nodeTitle = result.title ?? fallbackTitle;
  const closeSearchModal = useCanvasStore((state) => state.closeSearchModal);
  const { fitView } = useReactFlow();
  const isAttachedToNole = useIsNodeAttached(result.nodeId);
  const previewImages = useMemo(() => result.images, [result.images]);
  const canOpenWindow = canNodeTypeBeOpenedInWindow(result.type);
  const sortedSnippets = useMemo(
    () =>
      [...result.snippets].sort((a, b) => {
        const pageA = a.page ?? Number.MAX_SAFE_INTEGER;
        const pageB = b.page ?? Number.MAX_SAFE_INTEGER;
        if (pageA !== pageB) return pageA - pageB;
        if (a.order !== b.order) return a.order - b.order;
        return a.matchStart - b.matchStart;
      }),
    [result.snippets],
  );

  const handleGoToNode = () => {
    fitView({
      nodes: [{ id: result.nodeId }],
      duration: 500,
      minZoom: 0.5,
      maxZoom: 1,
    });
    closeSearchModal();
  };

  const handleOpenWindow = () => {
    if (!canOpenWindow) return;
    onOpenWindow();
  };

  return (
    <div
      className={cn(
        "relative flex flex-col rounded p-3 transition-colors cursor-pointer",
        selected ? "bg-slate-200" : "hover:bg-slate-100",
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
        handleOpenWindow();
      }}
      role={canOpenWindow ? "button" : undefined}
      tabIndex={canOpenWindow ? 0 : undefined}
      title={
        isAttachedToNole
          ? "Alt+clic pour detacher de Nole"
          : "Alt+clic pour attacher a Nole"
      }
      data-selected={selected ? "true" : undefined}
      onKeyDown={(event) => {
        if (!canOpenWindow) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        handleOpenWindow();
      }}
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
        <p className="font-bold text-lg">{nodeTitle}</p>
        <span className="text-sm text-muted-foreground bg-slate-200 px-1 rounded-sm">
          {result.type}
        </span>
      </div>

      <div className="flex flex-col gap-2 mt-2">
        {sortedSnippets.length === 0 ? (
          <span className="text-muted-foreground">Aucun extrait</span>
        ) : (
          sortedSnippets.map((snippet, index) => (
            <SnippetRow
              key={`${result.nodeId}-${snippet.order}-${index}`}
              snippet={snippet}
              query={query}
            />
          ))
        )}
      </div>

      {previewImages.length > 0 ? (
        <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {previewImages.map((image) => (
            <div key={image.imageUrl} className="relative shrink-0">
              <img
                src={image.imageUrl}
                alt="Apercu"
                className="h-48 w-48 rounded-md object-cover border"
              />
              {typeof image.page === "number" ? (
                <span className="absolute right-1 bottom-1 text-xs text-white bg-black/70 px-1.5 py-0.5 rounded-full">
                  Page {image.page}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SnippetRow({
  snippet,
  query,
}: {
  snippet: {
    snippet: string;
    chunkType: "node" | "page" | "annotation";
    order: number;
    page?: number;
    imageUrl?: string;
    matchStart: number;
    matchEnd: number;
  };
  query: string;
}) {
  const pageLabel =
    typeof snippet.page === "number"
      ? `Page ${snippet.page}`
      : snippet.chunkType;

  const highlightedParts = useMemo(() => {
    const terms = Array.from(
      new Set(
        query
          .trim()
          .split(/\s+/)
          .map((term) => term.trim())
          .filter((term) => term.length >= 2),
      ),
    );

    if (terms.length === 0) return [snippet.snippet];

    const escapedTerms = terms.map((term) =>
      term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    const regex = new RegExp(`(${escapedTerms.join("|")})`, "ig");
    return snippet.snippet.split(regex);
  }, [query, snippet.snippet]);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 overflow-hidden line-clamp-2 text-muted-foreground leading-snug">
        {highlightedParts.map((part, index) => {
          const isMatch = index % 2 === 1;
          return isMatch ? (
            <mark key={index} className="bg-yellow-200 rounded-sm px-0.5">
              {part}
            </mark>
          ) : (
            <Fragment key={index}>{part}</Fragment>
          );
        })}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded-sm">
        {pageLabel}
      </span>
    </div>
  );
}

function RecentRow({
  nodeId,
  nodeDataId,
  nodeType,
  updatedAt,
  selected,
  onSelect,
  onOpen,
}: {
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  nodeType: string;
  updatedAt?: number;
  selected: boolean;
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
    <button
      type="button"
      disabled={!canOpen}
      data-selected={selected ? "true" : undefined}
      onMouseEnter={onSelect}
      onClick={() => onOpen({ nodeId, nodeDataId, nodeType })}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors",
        selected ? "bg-slate-200" : "hover:bg-slate-100",
        !canOpen && "opacity-50",
      )}
    >
      {Icon ? <Icon size={14} className="shrink-0 text-slate-500" /> : null}
      <span className="flex-1 min-w-0 truncate text-sm">
        {title || nodeType}
      </span>
      <span className="text-xs text-muted-foreground bg-slate-100 px-1.5 rounded shrink-0">
        {nodeType}
      </span>
      {updatedAt ? (
        <span className="text-[10px] text-muted-foreground shrink-0">
          {formatRelative(updatedAt)}
        </span>
      ) : null}
    </button>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString();
}
