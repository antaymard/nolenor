import { useMemo, useState } from "react";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
import { Input } from "@/components/shadcn/input";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import { TbSearch, TbX } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { useWindowsStore } from "@/stores/windowsStore";
import { canNodeTypeBeOpenedInWindow } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import type { NodeType } from "@/types/domain";
import { useSearch, type SearchResult } from "@/components/search/useSearch";
import {
  PreviewImages,
  SearchEmpty,
  SearchError,
  SearchSkeleton,
  SearchSnippet,
} from "@/components/search/searchUi";
import { formatRelative, sortSnippets } from "@/components/search/searchUtils";

interface MobileSearchSidebarProps {
  canvasId: Id<"canvases">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type OpenNodeParams = {
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  nodeType: NodeType | string;
};

export default function MobileSearchSidebar({
  canvasId,
  open,
  onOpenChange,
}: MobileSearchSidebarProps) {
  const [query, setQuery] = useState("");
  const openWindow = useWindowsStore((state) => state.openWindow);

  const {
    debouncedQuery,
    hasQuery,
    results,
    recents,
    error,
    isInitialLoading,
    isStale,
  } = useSearch({ canvasId, query, enabled: open });

  const handleOpenNode = (params: OpenNodeParams) => {
    if (!canNodeTypeBeOpenedInWindow(params.nodeType)) return;
    openWindow({
      xyNodeId: params.nodeId,
      nodeDataId: params.nodeDataId,
      nodeType: params.nodeType as NodeType,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[90vw] p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Recherche</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <TbSearch className="shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              type="text"
              aria-label="Rechercher"
              placeholder="Rechercher des nodes…"
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
                aria-label="Effacer la recherche"
                onClick={() => setQuery("")}
              >
                <TbX />
              </Button>
            ) : null}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isInitialLoading ? (
              <SearchSkeleton compact />
            ) : error ? (
              <SearchError message={error.message} />
            ) : hasQuery ? (
              results.length === 0 ? (
                <SearchEmpty icon={<TbSearch />} title="Aucun résultat" />
              ) : (
                <div
                  className={cn(
                    "flex flex-col gap-1 p-2 transition-opacity",
                    isStale && "opacity-60",
                  )}
                >
                  {results.map((result) => (
                    <MobileResultRow
                      key={result.nodeId}
                      result={result}
                      query={debouncedQuery}
                      onOpen={() =>
                        handleOpenNode({
                          nodeId: result.nodeId,
                          nodeDataId: result.nodeDataId,
                          nodeType: result.type,
                        })
                      }
                    />
                  ))}
                </div>
              )
            ) : !recents || recents.length === 0 ? (
              <SearchEmpty icon={<TbSearch />} title="Aucun node pour l'instant" />
            ) : (
              <div className="flex flex-col p-2">
                <h4 className="px-2 py-1 text-xs uppercase tracking-wider text-muted-foreground">
                  Récents
                </h4>
                {recents.map((entry) => (
                  <MobileRecentRow
                    key={entry.nodeData._id}
                    nodeId={entry.xyNodeId}
                    nodeDataId={entry.nodeData._id}
                    nodeType={entry.nodeData.type}
                    updatedAt={entry.nodeData.updatedAt}
                    onOpen={handleOpenNode}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MobileResultRow({
  result,
  query,
  onOpen,
}: {
  result: SearchResult;
  query: string;
  onOpen: () => void;
}) {
  const fallbackTitle = useNodeDataTitle(result.nodeDataId);
  const title = result.title ?? fallbackTitle;
  const Icon = getNodeIcon(result.type);
  const canOpen = canNodeTypeBeOpenedInWindow(result.type);
  const sortedSnippets = useMemo(
    () => sortSnippets(result.snippets),
    [result.snippets],
  );

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={onOpen}
      className={cn(
        "flex flex-col gap-1 rounded-md p-2 text-left",
        canOpen ? "hover:bg-accent/50" : "opacity-60",
      )}
    >
      <div className="flex w-full min-w-0 items-center gap-2">
        {Icon ? (
          <Icon size={14} className="shrink-0 text-muted-foreground" />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {title || result.type}
        </span>
        <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
          {result.type}
        </span>
      </div>
      <PreviewImages images={result.images} size="h-20 w-20" />
      {sortedSnippets.slice(0, 2).map((snippet, index) => (
        <SearchSnippet
          key={`${result.nodeId}-${index}`}
          snippet={snippet}
          query={query}
          compact
        />
      ))}
    </button>
  );
}

function MobileRecentRow({
  nodeId,
  nodeDataId,
  nodeType,
  updatedAt,
  onOpen,
}: {
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  nodeType: string;
  updatedAt?: number;
  onOpen: (params: OpenNodeParams) => void;
}) {
  const title = useNodeDataTitle(nodeDataId);
  const Icon = getNodeIcon(nodeType);
  const canOpen = canNodeTypeBeOpenedInWindow(nodeType);

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => onOpen({ nodeId, nodeDataId, nodeType })}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-2 text-left",
        canOpen ? "hover:bg-accent/50" : "opacity-50",
      )}
    >
      {Icon ? (
        <Icon size={14} className="shrink-0 text-muted-foreground" />
      ) : null}
      <span className="min-w-0 flex-1 truncate text-sm">
        {title || nodeType}
      </span>
      {updatedAt ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatRelative(updatedAt)}
        </span>
      ) : null}
    </button>
  );
}
